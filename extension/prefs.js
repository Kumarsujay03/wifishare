import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

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
    }
}
