#!/bin/bash
# Install wifishare from this checkout.
#
# The extension and the `wifishare` command are symlinked into this repo, so
# edits and `git pull` take effect right away (the extension after logging
# back in). The root helper and system config are copied, root-owned, and
# only re-copied (with sudo) when they changed. Safe to run again any time;
# `wifishare update` does a git pull and then runs this.
set -euo pipefail
REPO=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
cd "$REPO"

UUID=wifishare@kumarsujay03.github.io
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
HELPER=/usr/local/libexec/wifishare-helper
POLICY=/usr/share/polkit-1/actions/io.github.kumarsujay03.wifishare.policy
NM_CONF=/etc/NetworkManager/conf.d/90-wifishare.conf
NM_CONF_TEXT=$'[keyfile]\nunmanaged-devices=interface-name:ap0'

# --- system parts (sudo only when something changed) ---------------------

first_install=false
[[ -f $HELPER ]] || first_install=true

command -v nmcli >/dev/null || { echo "wifishare needs NetworkManager (nmcli)." >&2; exit 1; }

# Missing tools, by package name on this distro's package manager.
have() { command -v "$1" >/dev/null || [[ -x /usr/sbin/$1 || -x /sbin/$1 ]]; }
if command -v apt-get >/dev/null; then pm=apt dnsmasq_pkg=dnsmasq-base
elif command -v dnf >/dev/null; then pm=dnf dnsmasq_pkg=dnsmasq
elif command -v pacman >/dev/null; then pm=pacman dnsmasq_pkg=dnsmasq
elif command -v zypper >/dev/null; then pm=zypper dnsmasq_pkg=dnsmasq
else pm="" dnsmasq_pkg=dnsmasq
fi
missing=()
have hostapd || missing+=(hostapd)
have dnsmasq || missing+=("$dnsmasq_pkg")
have iw || missing+=(iw)
have nft || missing+=(nftables)
have qrencode || missing+=(qrencode)
if (( ${#missing[@]} )); then
    echo "==> Installing ${missing[*]}"
    case $pm in
        apt) sudo apt-get install -y "${missing[@]}" ;;
        dnf) sudo dnf install -y "${missing[@]}" ;;
        pacman) sudo pacman -S --needed --noconfirm "${missing[@]}" ;;
        zypper) sudo zypper --non-interactive install "${missing[@]}" ;;
        *) echo "Please install these with your package manager: ${missing[*]}" >&2; exit 1 ;;
    esac
fi

if ! cmp -s helper/wifishare-helper "$HELPER"; then
    echo "==> Updating the root helper (sudo)"
    sudo install -Dm755 -o root -g root helper/wifishare-helper "$HELPER"
fi
if ! cmp -s helper/io.github.kumarsujay03.wifishare.policy "$POLICY"; then
    echo "==> Updating the polkit policy (sudo)"
    sudo install -Dm644 -o root -g root helper/io.github.kumarsujay03.wifishare.policy "$POLICY"
fi

# Keep NetworkManager off ap0; the helper runs hostapd on it instead.
if [[ "$(cat "$NM_CONF" 2>/dev/null)" != "$NM_CONF_TEXT" ]]; then
    echo "==> Telling NetworkManager to leave ap0 alone (sudo)"
    printf '%s\n' "$NM_CONF_TEXT" | sudo tee "$NM_CONF" >/dev/null
    sudo nmcli general reload conf
fi
# Left over from the first, NetworkManager-based version.
nmcli connection delete "WiFi Share" >/dev/null 2>&1 || true

# ufw blocks DHCP/DNS from hotspot devices and forwarding by default.
if $first_install && command -v ufw >/dev/null && sudo ufw status | grep -q '^Status: active'; then
    echo "==> Allowing hotspot traffic through ufw"
    sudo ufw allow in on ap0 to any port 67 proto udp comment wifishare >/dev/null
    sudo ufw allow in on ap0 to any port 53 comment wifishare >/dev/null
    sudo ufw route allow in on ap0 comment wifishare >/dev/null
fi

# firewalld (Fedora, openSUSE): its nm-shared zone allows DHCP, DNS and
# sharing, the same as NetworkManager's own hotspot uses.
if command -v firewall-cmd >/dev/null && systemctl is-active -q firewalld \
    && [[ "$(sudo firewall-cmd --permanent --get-zone-of-interface=ap0 2>/dev/null)" != nm-shared ]]; then
    if sudo firewall-cmd --get-zones | grep -qw nm-shared; then
        echo "==> Adding ap0 to firewalld's nm-shared zone"
        sudo firewall-cmd --permanent --zone=nm-shared --add-interface=ap0 >/dev/null
        sudo firewall-cmd --reload >/dev/null
    else
        echo "!! firewalld has no nm-shared zone; allow DHCP, DNS and forwarding on ap0 yourself" >&2
    fi
fi

# --- user parts (symlinks into this repo) --------------------------------

# Replace an older copied install with a directory of symlinks.
mkdir -p "$EXT_DIR" "$HOME/.local/bin"
for f in metadata.json extension.js prefs.js; do
    ln -sfn "$REPO/extension/$f" "$EXT_DIR/$f"
done
ln -sfn "$REPO/bin/wifishare" "$EXT_DIR/wifishare"
ln -sfn "$REPO/bin/wifishare" "$HOME/.local/bin/wifishare"

# Make sure terminals find the wifishare command. fish doesn't read ~/.profile,
# and Ubuntu's ~/.profile only adds ~/.local/bin if it existed at login.
case ":$PATH:" in
*":$HOME/.local/bin:"*) ;;
*)
    if command -v fish >/dev/null; then
        fish -c 'fish_add_path -U ~/.local/bin' 2>/dev/null ||
            fish -c 'contains ~/.local/bin $fish_user_paths; or set -U fish_user_paths ~/.local/bin $fish_user_paths'
    fi
    for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
        case "$rc" in
        *bashrc) [[ -f $rc || ${SHELL##*/} == bash ]] || continue ;;
        *zshrc) [[ -f $rc || ${SHELL##*/} == zsh ]] || continue ;;
        esac
        grep -qs '# wifishare: ~/.local/bin' "$rc" && continue
        cat >>"$rc" <<'EOF'

# wifishare: ~/.local/bin on PATH
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) PATH="$HOME/.local/bin:$PATH" ;; esac
EOF
    done
    echo
    echo "Added ~/.local/bin to your PATH. Open a new terminal to use the wifishare command."
    ;;
esac

if ! gnome-extensions info "$UUID" >/dev/null 2>&1; then
    echo
    echo "Log out and back in so GNOME Shell finds the extension, then run:"
    echo "  gnome-extensions enable $UUID"
else
    gnome-extensions enable "$UUID" 2>/dev/null || true
fi

echo "wifishare is installed from $REPO"
echo
echo "Checking this laptop:"
"$REPO/bin/wifishare" doctor || true
