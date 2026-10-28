import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const ICON = 'network-wireless-hotspot-symbolic';
const POLL_SECONDS = 5;

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

        this._qrItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._qrIcon = new St.Icon({icon_size: 168, x_expand: true, x_align: Clutter.ActorAlign.CENTER});
        this._qrItem.add_child(this._qrIcon);
        this._qrPath = null;
        this.menu.addMenuItem(this._qrItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Hotspot Settings', () => this._ext.openPreferences());

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
        this._updateQr();
    }

    async _updateQr() {
        if (!this._state.active) {
            this._qrItem.visible = false;
            return;
        }
        try {
            const res = await run([this._cli, 'qr']);
            if (!res.ok) {
                this._qrItem.visible = false;
                return;
            }
            if (res.out !== this._qrPath) {
                this._qrPath = res.out;
                this._qrIcon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(res.out));
            }
            this._qrItem.visible = this._state.active;
        } catch {
            this._qrItem.visible = false;
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
