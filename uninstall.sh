#!/bin/bash
# Remove everything install.sh added. Your hotspot name/password in
# ~/.config/wifishare is kept.
set -uo pipefail

UUID=wifishare@kumarsujay03.github.io

"$HOME/.local/bin/wifishare" off 2>/dev/null
nmcli connection delete "WiFi Share" 2>/dev/null

gnome-extensions disable "$UUID" 2>/dev/null
rm -rf "$HOME/.local/share/gnome-shell/extensions/$UUID"
rm -f "$HOME/.local/bin/wifishare"

sudo rm -f /usr/local/libexec/wifishare-helper \
    /usr/share/polkit-1/actions/io.github.kumarsujay03.wifishare.policy \
    /etc/NetworkManager/conf.d/90-wifishare.conf
sudo nmcli general reload conf

if command -v ufw >/dev/null; then
    sudo ufw delete allow in on ap0 to any port 67 proto udp 2>/dev/null
    sudo ufw delete allow in on ap0 to any port 53 2>/dev/null
    sudo ufw route delete allow in on ap0 2>/dev/null
fi

echo "wifishare removed."
