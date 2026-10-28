import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function run(argv) {
    const proc = Gio.Subprocess.new(argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    const [, out, err] = proc.communicate_utf8(null, null);
    return {ok: proc.get_successful(), out: out.trim(), err: err.trim()};
}

export default class WifiSharePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const cli = `${this.path}/wifishare`;
        const config = JSON.parse(run([cli, 'config', '--json']).out);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Hotspot',
            description: 'Devices join this network to use your Wi-Fi connection. Changes apply right away if the hotspot is on.',
        });
        page.add(group);
        window.add(page);

        const ssidRow = new Adw.EntryRow({title: 'Network name', text: config.ssid, show_apply_button: true});
        const passRow = new Adw.PasswordEntryRow({title: 'Password (8–63 characters)', text: config.password, show_apply_button: true});
        group.add(ssidRow);
        group.add(passRow);

        const save = (key, row) => {
            const res = run([cli, 'set', key, row.text]);
            const msg = res.ok ? 'Saved' : res.err.replace(/^wifishare: /, '');
            window.add_toast(new Adw.Toast({title: msg}));
        };
        ssidRow.connect('apply', () => save('ssid', ssidRow));
        passRow.connect('apply', () => save('password', passRow));

        const bands = ['auto', '2.4', '5'];
        const bandRow = new Adw.ComboRow({
            title: 'Band',
            subtitle: 'While you’re on Wi-Fi, the hotspot can only use your connection’s band. 2.4 or 5 GHz applies on Ethernet or a network on that band.',
            model: Gtk.StringList.new(['Same as Wi-Fi connection', '2.4 GHz', '5 GHz']),
            selected: Math.max(0, bands.indexOf(config.band)),
        });
        bandRow.connect('notify::selected', () => {
            const res = run([cli, 'set', 'band', bands[bandRow.selected]]);
            const msg = res.ok ? res.out.split('\n').pop() || 'Saved' : res.err.replace(/^wifishare: /, '');
            window.add_toast(new Adw.Toast({title: msg, timeout: 6}));
        });
        group.add(bandRow);
    }
}
