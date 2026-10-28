import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const ICON = 'network-wireless-hotspot-symbolic';
const POLL_SECONDS = 5;
const BANDS = [
    ['auto', 'Same as Wi-Fi'],
    ['2.4', '2.4 GHz'],
    ['5', '5 GHz'],
];

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

function copy(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
}

function vbox(params) {
    const box = new St.BoxLayout(params);
    if ('orientation' in box)
        box.orientation = Clutter.Orientation.VERTICAL;
    else
        box.vertical = true;
    return box;
}

// Shown in the middle of the screen: the Quick Settings menu is too short
// to fit a scannable QR code.
const QrDialog = GObject.registerClass(
class QrDialog extends ModalDialog.ModalDialog {
    _init(qrPath, ssid, password) {
        super._init({destroyOnClose: true});
        const box = vbox({x_align: Clutter.ActorAlign.CENTER, style: 'spacing: 12px;'});
        box.add_child(new St.Label({
            text: 'Scan to join',
            x_align: Clutter.ActorAlign.CENTER,
            style: 'font-weight: bold; font-size: 1.4em;',
        }));
        box.add_child(new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(qrPath)),
            icon_size: 280,
            x_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({
            text: `Network: ${ssid}\nPassword: ${password}`,
            x_align: Clutter.ActorAlign.CENTER,
        }));
        this.contentLayout.add_child(box);
        this.addButton({label: 'Close', action: () => this.close(), key: Clutter.KEY_Escape, default: true});
    }
});

const ShareToggle = GObject.registerClass(
class ShareToggle extends QuickMenuToggle {
    _init(ext) {
        super._init({title: 'Share Wi-Fi', iconName: ICON, toggleMode: false});
        this._ext = ext;
        this._cli = `${ext.path}/wifishare`;
        this._busy = false;
        this._state = {active: false, ssid: '', password: '', clients: 0};

        this.menu.setHeader(ICON, 'Share Wi-Fi', 'Off');

        this._ssidItem = new PopupMenu.PopupMenuItem('');
        this._ssidItem.connect('activate', () => copy(this._state.ssid));
        this.menu.addMenuItem(this._ssidItem);

        this._passItem = new PopupMenu.PopupMenuItem('');
        this._passItem.connect('activate', () => copy(this._state.password));
        this.menu.addMenuItem(this._passItem);

        this._bandMenu = new PopupMenu.PopupSubMenuMenuItem('');
        this._bandItems = BANDS.map(([band, label]) => {
            const item = this._bandMenu.menu.addAction(label, () => this._setBand(band));
            item._band = band;
            return item;
        });
        this.menu.addMenuItem(this._bandMenu);

        this.menu.addAction('Change Name & Password…', () => this._ext.openPreferences());

        this._qrItem = this.menu.addAction('Show QR Code for Phones…', () => this._showQr());


        this.connect('clicked', () => this._toggle());
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._refresh();
        });

        this._refresh();
    }

    async _toggle() {
        if (this._busy)
            return;
        this._busy = true;
        this.subtitle = this._state.active ? 'Turning off…' : 'Turning on…';
        try {
            const res = await run([this._cli, this._state.active ? 'off' : 'on']);
            if (!res.ok)
                Main.notify('Share Wi-Fi', res.err.replace(/^wifishare: /, '') || 'Something went wrong');
        } catch (e) {
            Main.notify('Share Wi-Fi', `Could not run wifishare: ${e.message}`);
        }
        this._busy = false;
        await this._refresh();
    }

    async _setBand(band) {
        try {
            const res = await run([this._cli, 'set', 'band', band]);
            const msg = res.ok ? res.out.split('\n').find(l => l.startsWith('Saved.')) : res.err.replace(/^wifishare: /, '');
            if (msg)
                Main.notify('Share Wi-Fi', msg);
        } catch (e) {
            Main.notify('Share Wi-Fi', `Could not run wifishare: ${e.message}`);
        }
        await this._refresh();
    }

    async _refresh() {
        let state;
        try {
            const res = await run([this._cli, 'status', '--json']);
            if (!res.ok)
                return;
            state = JSON.parse(res.out);
        } catch (e) {
            console.error(`wifishare: ${e.message}`);
            return;
        }
        if (this._busy)
            return;
        this._state = state;
        this._update();
        this._schedulePoll();
    }

    _update() {
        const s = this._state;
        this.checked = s.active;

        let status = 'Off';
        if (s.active)
            status = s.clients === 1 ? '1 device' : `${s.clients} devices`;
        this.subtitle = s.active ? status : null;
        this.menu.setHeader(ICON, 'Share Wi-Fi',
            s.active ? `On · ${status} · ${s.ghz} GHz, channel ${s.channel}` : 'Off');

        this._ssidItem.label.text = `Network: ${s.ssid}`;
        this._passItem.label.text = `Password: ${s.password}`;

        const band = BANDS.find(([b]) => b === s.band) ?? BANDS[0];
        this._bandMenu.label.text = `Band: ${band[1]}`;
        for (const item of this._bandItems) {
            item.setOrnament(item._band === band[0]
                ? PopupMenu.Ornament.CHECK ?? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }
        this._qrItem.visible = s.active;
    }

    async _showQr() {
        Main.panel.statusArea.quickSettings.menu.close();
        try {
            const res = await run([this._cli, 'qr']);
            if (!res.ok) {
                Main.notify('Share Wi-Fi', res.err.replace(/^wifishare: /, '') || 'Could not make the QR code');
                return;
            }
            new QrDialog(res.out, this._state.ssid, this._state.password).open();
        } catch (e) {
            Main.notify('Share Wi-Fi', `Could not run wifishare: ${e.message}`);
        }
    }

    // Poll only while sharing, to keep the device count current.
    _schedulePoll() {
        if (this._pollId || !this._state.active)
            return;
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._pollId = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = 0;
        }
        super.destroy();
    }
});

const ShareIndicator = GObject.registerClass(
class ShareIndicator extends SystemIndicator {
    _init(ext) {
        super._init();
        this._icon = this._addIndicator();
        this._icon.iconName = ICON;

        const toggle = new ShareToggle(ext);
        toggle.bind_property('checked', this._icon, 'visible', GObject.BindingFlags.SYNC_CREATE);
        this.quickSettingsItems.push(toggle);
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

export default class WifiShareExtension extends Extension {
    enable() {
        this._indicator = new ShareIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
