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

missing=()
command -v hostapd >/dev/null || missing+=(hostapd)
command -v dnsmasq >/dev/null || missing+=(dnsmasq-base)
command -v qrencode >/dev/null || missing+=(qrencode)
if (( ${#missing[@]} )); then
    echo "==> Installing ${missing[*]}"
    sudo apt-get install -y "${missing[@]}"
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

# --- user parts (symlinks into this repo) --------------------------------

# Replace an older copied install with a directory of symlinks.
mkdir -p "$EXT_DIR" "$HOME/.local/bin"
for f in metadata.json extension.js prefs.js; do
    ln -sfn "$REPO/extension/$f" "$EXT_DIR/$f"
done
ln -sfn "$REPO/bin/wifishare" "$EXT_DIR/wifishare"
ln -sfn "$REPO/bin/wifishare" "$HOME/.local/bin/wifishare"

if ! gnome-extensions info "$UUID" >/dev/null 2>&1; then
    echo
    echo "Log out and back in so GNOME Shell finds the extension, then run:"
    echo "  gnome-extensions enable $UUID"
else
    gnome-extensions enable "$UUID" 2>/dev/null || true
fi

echo "wifishare is installed from $REPO"
