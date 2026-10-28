---
name: Bug report
about: Something doesn't work
labels: bug
---

**What happened**

**What you expected**

**Steps to reproduce**

**System**
- `wifishare version`:
- Distro and `gnome-shell --version`:
- Wi-Fi card and driver (`lspci -k | grep -A3 -i network`):
- `iw list | grep -A4 'valid interface combinations'`:

**Output** (remove your hotspot password)
```
wifishare on
cat /run/wifishare/hostapd.log
```
