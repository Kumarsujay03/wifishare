# Changelog

## 1.1.1 — 2026-10-29

- **`wifishare: command not found` fixed**: the installer now adds
  `~/.local/bin` to your PATH when it's missing (fish, bash and zsh), so the
  command works in new terminals. Before, the command was missing in fish,
  and on a fresh Ubuntu install until you logged out and back in.
- `wifishare doctor` checks that the command is on your PATH.

## 1.1.0 — 2026-10-29

- **Works when your Wi-Fi is on a channel that can't host a hotspot**
  (radar-protected DFS channels, 6 GHz, or channels the card marks No-IR):
  wifishare now moves your Wi-Fi to the same network's 2.4 GHz band while
  sharing, and releases it when you turn sharing off. Before, it just
  showed an error.
- **Band choice is kept and works more often**: choosing 2.4 or 5 GHz now
  reconnects your Wi-Fi on that band of the same network when the card needs
  it. If that's not possible, the hotspot keeps running on your Wi-Fi's band.
- Cards that can run the hotspot on a different channel from the Wi-Fi
  connection now use a free channel instead of failing.
- New `wifishare doctor` checks the Wi-Fi card, the current channel, the
  installed parts and the firewall; the installer runs it at the end.
- Installer supports apt, dnf, pacman and zypper, and firewalld.
- Root helper picks another subnet if 192.168.137.x is taken, works with
  drivers that can't set the MAC while adding the interface, and passes the
  country to hostapd when known.
- Settings: **Switch Wi-Fi band when needed** option and the real hotspot
  address. Clearer error messages that say what to change.

## 1.0.0 — 2026-10-28

First release.

- **Share Wi-Fi** toggle in GNOME Quick Settings (GNOME 45–50) that shares
  your Wi-Fi connection through a hotspot while staying connected.
- Hotspot runs on a virtual `ap0` interface with hostapd, dnsmasq and
  nftables, so it works on cards (like Intel's) where NetworkManager's
  hotspot can't run alongside a Wi-Fi connection.
- Menu with network name and password (click to copy), band picker,
  connected devices, QR code dialog and a link to settings.
- Settings window with Hotspot, Join (QR code), Devices and About tabs.
- Connected devices with name, IP, MAC, signal, time connected and data used.
- Band setting: same as Wi-Fi (default), 2.4 GHz or 5 GHz.
- `wifishare` CLI: `on`, `off`, `toggle`, `status`, `clients`, `set`, `qr`,
  `update`, `version`.
- `wifishare update` pulls from GitHub and reinstalls only what changed.
- Root helper limited by polkit to the logged-in user; network name and
  password are passed over stdin, never on the command line.
