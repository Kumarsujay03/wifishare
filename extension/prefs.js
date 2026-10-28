import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const REFRESH_SECONDS = 3;
const BANDS = ['auto', '2.4', '5'];

function run(argv) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = Gio.Subprocess.new(argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(e);
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, out, err] = p.communicate_utf8_finish(res);
                resolve({ok: p.get_successful(), out: out.trim(), err: err.trim()});
            } catch (e) {
                reject(e);
            }
        });
    });
}

const cleanError = err => err.replace(/^wifishare: /, '') || 'Something went wrong';

function formatBytes(n) {
    if (n >= 1e9)
        return `${(n / 1e9).toFixed(1)} GB`;
    if (n >= 1e6)
        return `${(n / 1e6).toFixed(1)} MB`;
    return `${Math.round(n / 1e3)} KB`;
}

function formatDuration(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60;
    if (h)
        return `${h} h ${m} min`;
    return m ? `${m} min` : `${sec} s`;
}

// Signal in dBm to a rough quality word.
function signalWord(dbm) {
    if (dbm === null)
        return '';
    if (dbm >= -55)
        return 'Excellent';
    if (dbm >= -67)
        return 'Good';
    if (dbm >= -75)
        return 'Fair';
    return 'Weak';
}

function copyButton(window, getText, what) {
    const button = new Gtk.Button({
        icon_name: 'edit-copy-symbolic',
        valign: Gtk.Align.CENTER,
        tooltip_text: `Copy ${what}`,
        css_classes: ['flat'],
    });
    button.connect('clicked', () => {
        Gdk.Display.get_default().get_clipboard().set(getText());
        window.add_toast(new Adw.Toast({title: `${what[0].toUpperCase()}${what.slice(1)} copied`}));
    });
    return button;
}

export default class WifiSharePreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const cli = `${this.path}/wifishare`;
        window.set_default_size(680, 860);
        window.search_enabled = false;

        const page = new Adw.PreferencesPage();
        window.add(page);

        // --- Status --------------------------------------------------------

        const statusGroup = new Adw.PreferencesGroup({title: 'Status'});
        page.add(statusGroup);

        const switchRow = new Adw.SwitchRow({title: 'Share Wi-Fi'});
        statusGroup.add(switchRow);
        const sourceRow = new Adw.ActionRow({title: 'Internet from', subtitle: '–'});
        sourceRow.add_prefix(new Gtk.Image({icon_name: 'network-wireless-symbolic'}));
        statusGroup.add(sourceRow);
        const addressRow = new Adw.ActionRow({title: 'Hotspot address', subtitle: '192.168.137.1'});
        addressRow.add_prefix(new Gtk.Image({icon_name: 'network-workgroup-symbolic'}));
        statusGroup.add(addressRow);

        // --- Settings ------------------------------------------------------

        const settingsGroup = new Adw.PreferencesGroup({
            title: 'Hotspot',
            description: 'Devices join this network to use your connection. Changes apply right away if the hotspot is on.',
        });
        page.add(settingsGroup);

        const ssidRow = new Adw.EntryRow({title: 'Network name', show_apply_button: true});
        const passRow = new Adw.PasswordEntryRow({title: 'Password (8–63 characters)', show_apply_button: true});
        settingsGroup.add(ssidRow);
        settingsGroup.add(passRow);

        const bandRow = new Adw.ComboRow({
            title: 'Band',
            subtitle: 'While you’re on Wi-Fi, the hotspot can only use your connection’s band. 2.4 or 5 GHz applies on Ethernet or a network on that band.',
            model: Gtk.StringList.new(['Same as Wi-Fi connection', '2.4 GHz', '5 GHz']),
        });
        settingsGroup.add(bandRow);

        // --- Join ----------------------------------------------------------

        const joinGroup = new Adw.PreferencesGroup({
            title: 'Join from a Phone',
            description: 'Point the phone’s camera at the code, or type the name and password.',
        });
        page.add(joinGroup);

        const qr = new Gtk.Picture({
            content_fit: Gtk.ContentFit.CONTAIN,
            width_request: 260,
            height_request: 260,
            halign: Gtk.Align.CENTER,
            margin_bottom: 12,
        });
        joinGroup.add(qr);

        const joinNameRow = new Adw.ActionRow({title: 'Network', subtitle_selectable: true});
        const joinPassRow = new Adw.ActionRow({title: 'Password', subtitle_selectable: true});
        joinNameRow.add_suffix(copyButton(window, () => state?.ssid ?? '', 'network name'));
        joinPassRow.add_suffix(copyButton(window, () => state?.password ?? '', 'password'));
        joinGroup.add(joinNameRow);
        joinGroup.add(joinPassRow);

        // --- Devices -------------------------------------------------------

        const devicesGroup = new Adw.PreferencesGroup({title: 'Connected Devices'});
        page.add(devicesGroup);
        let deviceRows = [];

        // --- About ---------------------------------------------------------

        const aboutGroup = new Adw.PreferencesGroup({title: 'About'});
        page.add(aboutGroup);
        aboutGroup.add(new Adw.ActionRow({
            title: 'Version',
            subtitle: `${this.metadata.version}`,
        }));
        aboutGroup.add(new Adw.ActionRow({
            title: 'Command line',
            subtitle: 'wifishare on · off · status · clients · update',
            subtitle_selectable: true,
        }));
        const repoRow = new Adw.ActionRow({
            title: 'Source code and updates',
            subtitle: this.metadata.url,
            activatable: true,
        });
        repoRow.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        repoRow.connect('activated', () => Gio.AppInfo.launch_default_for_uri(this.metadata.url, null));
        aboutGroup.add(repoRow);

        // --- Behaviour -----------------------------------------------------

        let state = null;
        let updating = false;   // true while we set widgets from state
        let busy = false;       // true while turning on/off
        let qrPath = null;

        const toast = (title, timeout = 3) => window.add_toast(new Adw.Toast({title, timeout}));

        const showDevices = devices => {
            for (const row of deviceRows)
                devicesGroup.remove(row);
            deviceRows = [];

            if (!state.active) {
                devicesGroup.description = 'Turn on the hotspot to see who’s connected.';
                return;
            }
            devicesGroup.description = devices.length
                ? 'Names are what each device reports. Phones often use a random MAC address per network.'
                : 'No devices connected yet.';
            for (const d of devices) {
                const row = new Adw.ActionRow({
                    title: GLib.markup_escape_text(d.name || 'Unnamed device', -1),
                    subtitle: [
                        `IP ${d.ip || 'not assigned yet'} · MAC ${d.mac}`,
                        [
                            d.signal === null ? null : `Signal ${signalWord(d.signal)} (${d.signal} dBm)`,
                            `Connected ${formatDuration(d.connected)}`,
                            `↓ ${formatBytes(d.tx)} ↑ ${formatBytes(d.rx)}`,
                        ].filter(Boolean).join(' · '),
                    ].join('\n'),
                    subtitle_lines: 2,
                    subtitle_selectable: true,
                });
                row.add_prefix(new Gtk.Image({icon_name: 'phone-symbolic', pixel_size: 24}));
                row.add_suffix(copyButton(window, () => d.ip || d.mac, 'IP address'));
                devicesGroup.add(row);
                deviceRows.push(row);
            }
        };

        const updateQr = async () => {
            const res = await run([cli, 'qr']);
            if (!res.ok) {
                qr.visible = false;
                return;
            }
            qr.visible = true;
            if (res.out !== qrPath) {
                qrPath = res.out;
                qr.set_filename(qrPath);
            }
        };

        const refresh = async () => {
            let res;
            try {
                res = await run([cli, 'status', '--json']);
            } catch (e) {
                toast(`Could not run wifishare: ${e.message}`);
                return;
            }
            if (!res.ok || busy)
                return;
            const first = state === null;
            state = JSON.parse(res.out);

            updating = true;
            switchRow.active = state.active;
            switchRow.subtitle = state.active
                ? `On · ${state.clients === 1 ? '1 device' : `${state.clients} devices`} · ${state.ghz} GHz, channel ${state.channel}`
                : 'Off';
            if (first) {
                // Don't overwrite what the user is typing on later refreshes.
                ssidRow.text = state.ssid;
                passRow.text = state.password;
                bandRow.selected = Math.max(0, BANDS.indexOf(state.band));
            }
            updating = false;

            sourceRow.subtitle = GLib.markup_escape_text(state.source
                ? `${state.source} (${state.source_dev})`
                : state.source_dev || 'No internet connection', -1);
            addressRow.visible = state.active;
            joinNameRow.subtitle = GLib.markup_escape_text(state.ssid, -1);
            joinPassRow.subtitle = GLib.markup_escape_text(state.password, -1);
            showDevices(state.devices ?? []);
            updateQr();
        };

        switchRow.connect('notify::active', async () => {
            if (updating || busy)
                return;
            busy = true;
            switchRow.sensitive = false;
            switchRow.subtitle = switchRow.active ? 'Turning on…' : 'Turning off…';
            const res = await run([cli, switchRow.active ? 'on' : 'off']).catch(e => ({ok: false, err: e.message}));
            if (!res.ok)
                toast(cleanError(res.err), 8);
            busy = false;
            switchRow.sensitive = true;
            refresh();
        });

        const save = async (key, value) => {
            const res = await run([cli, 'set', key, value]);
            if (res.ok)
                toast(res.out.split('\n').find(l => l.startsWith('Saved.')) || 'Saved', 6);
            else
                toast(cleanError(res.err), 6);
            refresh();
        };
        ssidRow.connect('apply', () => save('ssid', ssidRow.text));
        passRow.connect('apply', () => save('password', passRow.text));
        bandRow.connect('notify::selected', () => {
            if (!updating)
                save('band', BANDS[bandRow.selected]);
        });

        // Keep the status and device list live while the window is open.
        const timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
            refresh();
            return GLib.SOURCE_CONTINUE;
        });
        window.connect('close-request', () => {
            GLib.source_remove(timer);
            return false;
        });

        await refresh();
    }
}
