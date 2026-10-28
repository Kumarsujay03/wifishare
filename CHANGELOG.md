# Changelog

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
