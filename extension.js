// Huawei WMI controls

const { St, Gio, GLib, Meta, Shell, GObject } = imports.gi;
const UPower = imports.gi.UPowerGlib;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const GETTEXT_DOMAIN = 'huawei-wmi';
const Gettext = imports.gettext.domain(GETTEXT_DOMAIN);
const _ = Gettext.gettext;

const ByteArray = imports.byteArray;

const Display = global.display;

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

		this._battery_watching = false;
		this._topping_off = false;
		this._fn_led = false;

		this._file_sys_str = "/sys/devices/platform/huawei-wmi/charge_control_thresholds";
		this._file_def_str = "/etc/default/huawei-wmi/charge_control_thresholds";

		this._icon_gear = Gio.icon_new_for_string(`${Me.path}/gear-symbolic.svg`);
		this._icon_gear_lock = Gio.icon_new_for_string(`${Me.path}/gear-lock-symbolic.svg`);

		let hbox = this._icon_box = new St.BoxLayout({style_class: 'panel-status-menu-box'}); {
			let icon = this.icon = new St.Icon({
				gicon: this._icon_gear,
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

		let top_off = this._top_off = new NonClosingPopupSwitchMenuItem(_("Top off battery"), false); {
			top_off.connect('toggled', (item, state) => this._set_top_off(state));
		}; this.menu.addMenuItem(top_off);

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		let fn_lock = this._fn_lock = new NonClosingPopupSwitchMenuItem(_("Fn-Lock"), false); {
			fn_lock.connect('toggled', (item, state) => this._set_fn_lock(state));
		}; this.menu.addMenuItem(fn_lock);

		let power_unlock = this._power_unlock = new NonClosingPopupSwitchMenuItem(_("Power unlock"), false); {
			power_unlock.connect('toggled', (item, state) => this._set_power_unlock(state));
		}; this.menu.addMenuItem(power_unlock);

		this.connect('enter-event', () => this._update());
		this.connect('button-press-event', () => this._update());
		this.connect('key-press-event', () => this._update());
		this.menu.connect('open-state-changed', () => {
			if (this._bpm.sensitive) this._bpm.activate();
		});

		this._fullscreen_changed_s = Display.connect('in-fullscreen-changed', this._fullscreen_changed.bind(this));

		this._fn_led_timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 1000, () => this._update_fn_led() || true);

		this._bind_keys();

		this._update();
	}

	_destroy() {
		this._unbind_keys();
		if (this._fullscreen_changed_s !== null) Display.disconnect(this._fullscreen_changed_s);
		if (this._fn_led_timeout !== null) GLib.timeout_remove(this._fn_led_timeout);
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

	_fullscreen_changed() {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/kbdlight_timeout");

		try {
			if (Main.layoutManager.primaryMonitor.inFullscreen) {
				this._fullscreen_changed_timeout = Number(ByteArray.toString(file.load_contents(null)[1]));
				file.replace_contents("1", null, false, 0, null);
			} else {
				file.replace_contents(`${this._fullscreen_changed_timeout || 300}`, null, false, 0, null);
			}
		} catch (e) {
			Display.disconnect(this._fullscreen_changed_s);
			this._fullscreen_changed_s = null;
			return;
		}
	}

	_key_power_unlock() {
		let icon, text;

		let old_state = this._power_unlock.state;
		this._set_power_unlock();

		if (!this._power_unlock.visible) return;

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

	_update() {
		this._set_bpm();
		this._set_fn_lock();
		this._set_power_unlock();
		this._update_fn_led();
		this._set_top_off();
	}

	_update_fn_led() {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/leds/platform::fn_led/brightness");

		let on;
		try {
			on = Number(ByteArray.toString(file.load_contents(null)[1]));
		} catch (e) {
			return;
		}

		if (on != this._fn_led) {
			this._fn_led = on;
			this.icon.set_gicon(on?this._icon_gear_lock:this._icon_gear);
			Main.osdWindowManager.show(-1, Gio.icon_new_for_string('preferences-desktop-keyboard-shortcuts-symbolic'), `Fn-Lock ${on?'on':'off'}`);
		}
	}

	_set_bpm(low, high) {
		let _file_sys = Gio.File.new_for_path(this._file_sys_str);
		let _file_def = Gio.File.new_for_path(this._file_def_str);

		if (low || high)
			try {
				_file_sys.replace_contents(`${low} ${high}`, null, false, 0, null);
				_file_def.replace_contents(`${low} ${high}`, null, false, 0, null);
			} catch (e) {}

		try {
			[low, high] = ByteArray.toString(_file_def.load_contents(null)[1]).split(' ').map(Number);
		} catch (e) {
			this._bpm.setSensitive(false);
			this._bpm.label.set_text(this._BPM);
			return;
		}
		this._bpm.setSensitive(true);
		this._bpm.label.set_text(this._BPM + `: ${low}%-${high}%`);
	}

	_update_top_off() {
		this._get_battery(proxy => {
			let is_discharging = (proxy.State === UPower.DeviceState.DISCHARGING)
			let is_fully_charged = (proxy.State === UPower.DeviceState.FULLY_CHARGED)
			if (is_fully_charged) this._stop_top_off();
			else if (is_discharging) this._stop_top_off();
		})
	}

	_start_top_off() {
		let _file_sys = Gio.File.new_for_path(this._file_sys_str);

		this._get_battery(proxy => {  // Connects watcher
			this._battery_watching = proxy.connect('g-properties-changed', this._update_top_off.bind(this));
			try {
				_file_sys.replace_contents("0 100", null, false, 0, null);
				this._topping_off = true;
			} catch (e) {}
		})
	}

	_stop_top_off() {
		let _file_sys = Gio.File.new_for_path(this._file_sys_str);
		let _file_def = Gio.File.new_for_path(this._file_def_str);

		let def_low, def_high;
		this._get_battery(proxy => {  // Disconnects watcher
			proxy.disconnect(this._battery_watching);
			try {  // Reinstates old BPM values
				[def_low, def_high] = ByteArray.toString(_file_def.load_contents(null)[1]).split(' ').map(Number);
				_file_sys.replace_contents(`${def_low} ${def_high}`, null, false, 0, null);
				this._topping_off = false;
			} catch (e) {}
		});
	}

	_get_battery(callback) {
		let menu = Main.panel.statusArea.aggregateMenu;
		if (menu && menu._power) {
			callback(menu._power._proxy, menu._power);
		}
	}

	_set_top_off(state) {
		let _file_sys = Gio.File.new_for_path(this._file_sys_str);
		let _file_def = Gio.File.new_for_path(this._file_def_str);

		let sys_low, sys_high, def_low, def_high;
		let is_discharging;
		this._get_battery(proxy => { is_discharging = (proxy.State === UPower.DeviceState.DISCHARGING) });

		// Check if the button to enable battery top-off should be available and
		// set toggle state depending on the actual values set in /sys and /etc
		try {
			[sys_low, sys_high] = ByteArray.toString(_file_sys.load_contents(null)[1]).split(' ').map(Number);
			[def_low, def_high] = ByteArray.toString(_file_def.load_contents(null)[1]).split(' ').map(Number);

			if (def_low == 0 && def_high == 100) {  // If BPM == off -> Button = Unavailable and Off
				this._top_off.setToggleState(false);
				this._top_off.setSensitive(false);
			} else if ((def_low != 0 || def_high != 100) && !is_discharging) {  // If BPM is on and device is not discharging -> Button = Available
				this._top_off.setSensitive(true);
				// Check if top-off is active -> Button = On
				let top_is_active = ((def_low != 0 && def_high != 100) && (sys_low == 0 && sys_high == 100));
				if (top_is_active) {
					this._top_off.setToggleState(true);
					if (top_is_active && !this._topping_off) this._start_top_off();  // Reconnects watcher if extension has been restarted without reinstating BPM
				} else this._top_off.setToggleState(false);  // If top is not active -> Button = Off
			} else {  // Reinstates old BPM in case of unclean watcher exit and handles edge cases
				if (def_low != sys_low || def_high != sys_high) this._stop_top_off();
				this._top_off.setToggleState(false);
				this._top_off.setSensitive(false);
			}
		} catch (e) {
			global.log(e)
			this._top_off.setSensitive(false);
			return;
		}

		// Handle state change
		if (state !== undefined)
			try {
				if (state && !this._topping_off) this._start_top_off();  // Top off switch gets switched on
				else if (!state && this._topping_off) this._stop_top_off();  // Top off switch gets switched off
				this._set_top_off();
			} catch (e) {
				global.log(e)
			}
	}

	_set_fn_lock(state) {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/fn_lock_state");

		if (state !== null)
			try {
				file.replace_contents(Number(state).toString(), null, false, 0, null);
			} catch (e) {}

		try {
			state = Boolean(Number(ByteArray.toString(file.load_contents(null)[1])));
		} catch (e) {
			this._fn_lock.setSensitive(false);
			return;
		}
		this._fn_lock.setSensitive(true);
		this._fn_lock.setToggleState(state);
	}

	_set_power_unlock(state) {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/power_unlock");

		if (state !== null)
			try {
				file.replace_contents(Number(state).toString(), null, false, 0, null);
			} catch (e) {}

		try {
			state = Boolean(Number(ByteArray.toString(file.load_contents(null)[1])));
		} catch (e) {
			this._power_unlock.setSensitive(false);
			return;
		}
		this._power_unlock.setSensitive(true);
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

// by Sdore, 2021-22
//   apps.sdore.me
