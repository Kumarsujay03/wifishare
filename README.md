# wifishare

Share the Wi-Fi you're connected to through a hotspot, like Windows Mobile
Hotspot, from a **Share Wi-Fi** toggle in GNOME Quick Settings. You stay on
your Wi-Fi the whole time.

## How it works

Ubuntu's built-in hotspot uses your only Wi-Fi interface, so it disconnects
you from Wi-Fi. wifishare instead adds a second, virtual interface (`ap0`) on
the same card and runs the hotspot there:

- `hostapd` broadcasts the network (WPA2, on the same channel as your Wi-Fi,
  since one radio can only use one channel),
- `dnsmasq` hands out `192.168.137.x` addresses and answers DNS,
- an nftables table masquerades that subnet out through your connection.

NetworkManager is told to leave `ap0` alone: it would bring it up as a Wi-Fi
client first, which cards like Intel's refuse while you're already connected.

Turning the toggle off stops everything and removes `ap0`. Nothing starts at
login.

### Pieces

| Path | Runs as | What it does |
| --- | --- | --- |
| `extension/` | you, in GNOME Shell | Quick Settings toggle, menu (name, password, QR code, device count), settings window |
| `bin/wifishare` | you | CLI the extension calls: `on`, `off`, `toggle`, `status`, `set`, `qr`, `update` |
| `helper/wifishare-helper` | root, via pkexec | creates/removes `ap0`, runs hostapd + dnsmasq, sets up NAT |
| `helper/*.policy` | – | polkit rule letting the logged-in user run only that helper, without a password |

## Requirements

- GNOME Shell 45–50 (tested on Ubuntu with GNOME 50)
- A Wi-Fi card that can be a client and an access point at once. Check with
  `iw list`: under *valid interface combinations* you need `managed` and `AP`
  in the same line, e.g. `#{ managed } <= 1, #{ AP, ... } <= 1`.
- Your Wi-Fi on 2.4 GHz or a non-DFS 5 GHz channel.

## Install

```bash
git clone https://github.com/Kumarsujay03/wifishare.git
cd wifishare
./install.sh
```

Log out and back in the first time so GNOME Shell finds the extension.

The installer asks for sudo to install the helper, the polkit rule, a
NetworkManager config file, `hostapd`/`dnsmasq-base`/`qrencode` if missing,
and (if ufw is on) rules allowing DHCP, DNS and forwarding from `ap0`.

## Updating

The extension and `wifishare` command are symlinks into your checkout, so
edits and pulls apply straight away (the extension after logging back in).

```bash
wifishare update
```

pulls the repo and re-runs `install.sh`, which only asks for sudo when the
helper or system config actually changed.

## Use

```bash
wifishare on
wifishare status
wifishare set password 'something-long'
wifishare off
```

Name, password and band live in `~/.config/wifishare/config`. On first use
you get `<User> Hotspot` and a random password; change them from the toggle's
**Hotspot Settings**.

### Band

`wifishare set band auto|2.4|5` (or **Band** in Hotspot Settings).

- **auto** (default): same band and channel as your Wi-Fi connection.
- **2.4** / **5**: used when Wi-Fi isn't connected (e.g. you're on Ethernet),
  on the first channel your card may start a network on. While you are on
  Wi-Fi, most cards (including Intel) can only host on the connection's own
  channel, so a band that doesn't match is refused with an explanation. To
  get a 5 GHz hotspot over Wi-Fi, connect the laptop to a 5 GHz network.

Two bands at once isn't possible with one card: that needs two radios, which
is what a dual-band router has.

## Uninstall

```bash
./uninstall.sh
```

## License

MIT
