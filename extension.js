// Huawei WMI controls

const {St, Gio, Meta, Shell, GObject} = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const GETTEXT_DOMAIN = 'huawei-wmi';
const Gettext = imports.gettext.domain(GETTEXT_DOMAIN);
const _ = Gettext.gettext;

const ByteArray = imports.byteArray;

const BPM_PROFILES = {
	"Home": [40, 70],
	"Work": [70, 90],
	"Travel": [95, 100],
	"Disabled": [0, 100],
};

const NonClosingPopupSwitchMenuItem = GObject.registerClass(
class NonClosingPopupSwitchMenuItem extends PopupMenu.PopupSwitchMenuItem {
	activate(event) {
		this.toggle();
	}
});

const HuaweiWmiIndicator = GObject.registerClass(
class HuaweiWmiIndicator extends PanelMenu.Button { // TODO: move to system battery menu?
	_init() {
		super._init(0.0, _("Huawei WMI controls"));

		let hbox = this._icon_box = new St.BoxLayout({style_class: 'panel-status-menu-box'}); {
			let icon = this.icon = new St.Icon({
				gicon: Gio.icon_new_for_string(`${Me.path}/gear-symbolic.svg`),
				style_class: 'system-status-icon',
			});
			hbox.add_child(icon);
		}; this.add_child(hbox);

		let bpm = this._bpm = new PopupMenu.PopupSubMenuMenuItem(this._BPM = _("Battery protection mode")); {
			for (let name in BPM_PROFILES) {
				let [low, high] = BPM_PROFILES[name];
				let mi = new PopupMenu.PopupMenuItem(`${_(name)} (${low}%-${high}%)`); {
					mi.connect('activate', () => this._set_bpm(low, high));;
				}; bpm.menu.addMenuItem(mi);
			}

			// TODO: Custom
		}; this.menu.addMenuItem(bpm);

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		let fn_lock = this._fn_lock = new NonClosingPopupSwitchMenuItem(_("Fn-Lock"), false); {
			fn_lock.connect('toggled', (item, state) => this._set_fn_lock(state));
		}; this.menu.addMenuItem(fn_lock);

		let power_unlock = this._power_unlock = new NonClosingPopupSwitchMenuItem(_("Power unlock"), false); {
			power_unlock.connect('toggled', (item, state) => this._set_power_unlock(state));
		}; this.menu.addMenuItem(power_unlock);

		this.menu.connect('open-state-changed', () => this._bpm.activate());

		this._bind_keys();

		this._set_bpm(null, null);
		this._set_fn_lock(null);
		this._set_power_unlock(null);
	}

	_destroy() {
		this._unbind_keys();
	}

	_bind_keys() {
		let settings = ExtensionUtils.getSettings("org.gnome.shell.extensions.huawei-wmi");

		Main.wm.addKeybinding('hwmi-config', settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, this.menu.toggle.bind(this.menu));
		Main.wm.addKeybinding('hwmi-power-unlock', settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, this._key_power_unlock.bind(this));
	}

	_unbind_keys() {
		Main.wm.removeKeybinding('hwmi-config');
		Main.wm.removeKeybinding('hwmi-power-unlock');
	}

	_key_power_unlock() {
		let icon, text;

		let old_state = this._power_unlock.state;
		this._set_power_unlock();

		if (this._power_unlock.state === old_state) {
			icon = 'battery-caution-symbolic';
			text = _("Power Unlock\nunavailable on battery");
		} else {
			switch (this._power_unlock.state) {
				case true: {
					icon = 'power-profile-performance-symbolic';
					text = _("Performance Mode");
				}; break;

				case false: {
					icon = 'power-profile-balanced-symbolic';
					text = _("Balanced Mode");
				}; break;

				default: return;
			}
		}

		Main.osdWindowManager.show(-1, Gio.icon_new_for_string(icon), text);
	}

	_set_bpm(low, high) {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/charge_control_thresholds");

		if (low || high)
			try {
				file.replace_contents(`${low} ${high}`, null, false, 0, null);
			} catch (e) {}

		[low, high] = ByteArray.toString(file.load_contents(null)[1]).split(' ').map(Number);

		this._bpm.label.set_text(this._BPM + `: ${low}%-${high}%`);
	}

	_set_fn_lock(state) {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/fn_lock_state");

		if (state !== null)
			try {
				file.replace_contents(Number(state).toString(), null, false, 0, null);
			} catch (e) {}

		state = Boolean(Number(ByteArray.toString(file.load_contents(null)[1])));

		this._fn_lock.setToggleState(state);
	}

	_set_power_unlock(state) {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/power_unlock");

		if (state !== null)
			try {
				file.replace_contents(Number(state).toString(), null, false, 0, null);
			} catch (e) {}

		state = Boolean(Number(ByteArray.toString(file.load_contents(null)[1])));

		this._power_unlock.setToggleState(state);
	}
});

class Extension {
	constructor(uuid) {
		this._uuid = uuid;
		ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
	}

	enable() {
		this._indicator = new HuaweiWmiIndicator();
		Main.panel.addToStatusArea(this._uuid, this._indicator);
	}

	disable() {
		this._indicator.destroy();
		this._indicator = null;
	}
}

function init(meta) {
	return new Extension(meta.uuid);
}

// by Sdore, 2021-2022
//   apps.sdore.me
