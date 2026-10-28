# Contributing

Thanks for helping! Bug reports, "works on my card" reports, fixes and new
features are all welcome.

## Reporting a bug

Open an [issue](https://github.com/Kumarsujay03/wifishare/issues/new/choose)
and include:

- `wifishare version`
- your distro and `gnome-shell --version`
- your Wi-Fi card and driver: `lspci -k | grep -A3 -i network`
- `iw list | grep -A4 'valid interface combinations'`
- what you did, what you expected, and what happened, including the output
  of `wifishare on` and `cat /run/wifishare/hostapd.log` if it won't start

Remove your hotspot password from anything you paste.

## Setting up for development

```bash
git clone https://github.com/<you>/wifishare.git ~/wifishare
cd ~/wifishare
./install.sh
```

The install links the extension and the `wifishare` command to your clone, so:

- **`bin/wifishare`** changes apply immediately.
- **`extension/prefs.js`** (settings window) changes apply the next time you
  open the window.
- **`extension/extension.js`** (Quick Settings) changes need a log out and
  back in (on Wayland). To see errors: `journalctl -f -o cat /usr/bin/gnome-shell`.
- **`helper/`** changes need `./install.sh` again, which copies them as root.

## Code layout

| Path | What it is |
| --- | --- |
| `bin/wifishare` | Bash CLI; all logic that doesn't need root lives here |
| `helper/wifishare-helper` | the only code that runs as root; keep it small and validate every argument |
| `extension/extension.js` | GNOME Shell Quick Settings toggle and menu |
| `extension/prefs.js` | GTK4/libadwaita settings window |
| `install.sh`, `uninstall.sh` | idempotent install and removal |

The extension and settings window only talk to the system through
`wifishare ... --json`, so new features usually start in the CLI.

## Before opening a pull request

- Keep changes focused; one feature or fix per PR.
- Check syntax: `bash -n` on the shell scripts and, if you have it,
  `shellcheck bin/wifishare helper/wifishare-helper install.sh uninstall.sh`.
- Test the whole flow on your machine: `wifishare on`, join from a phone,
  `wifishare clients`, `wifishare off`, and confirm `ap0` is gone (`iw dev`).
- Anything touching `helper/` gets extra scrutiny because it runs as root
  without a password prompt. Never pass user-controlled strings to a shell
  or into config files without validating them.
- Update `README.md` and `CHANGELOG.md` if behaviour changes.

## Releasing (maintainers)

1. Bump `VERSION`, and `"version"` (+1) and `"version-name"` in
   `extension/metadata.json`.
2. Add the release to `CHANGELOG.md`.
3. Commit, tag `vX.Y.Z`, push with tags, and create a GitHub release from the
   changelog entry.
