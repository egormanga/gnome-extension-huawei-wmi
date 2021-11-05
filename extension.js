// Huawei WMI controls

const {St, Gio, GObject} = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const GETTEXT_DOMAIN = 'huawei-wmi';
const Gettext = imports.gettext.domain(GETTEXT_DOMAIN);
const _ = Gettext.gettext;

const ByteArray = imports.byteArray;

const BPM = _("Battery protection mode");

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

		this.add_child(new St.Icon({
			gicon: Gio.icon_new_for_string(`${Me.path}/gear-symbolic.svg`),
			style_class: 'system-status-icon',
		}));

		let bpm = this._bpm = new PopupMenu.PopupSubMenuMenuItem(BPM); {
			let mi;

			mi = new PopupMenu.PopupMenuItem(_("Home (40%-70%)")); {
				mi.connect('activate', () => this._set_bpm(40, 70));;
			}; bpm.menu.addMenuItem(mi);

			mi = new PopupMenu.PopupMenuItem(_("Work (70%-90%)")); {
				mi.connect('activate', () => this._set_bpm(70, 90));
			}; bpm.menu.addMenuItem(mi);

			mi = new PopupMenu.PopupMenuItem(_("Travel (95%-100%)")); {
				mi.connect('activate', () => this._set_bpm(95, 100))
			}; bpm.menu.addMenuItem(mi);

			mi = new PopupMenu.PopupMenuItem(_("Disabled (0%-100%)")); {
				mi.connect('activate', () => this._set_bpm(0, 100));
			}; bpm.menu.addMenuItem(mi);

			// TODO: Custom
		}; this.menu.addMenuItem(bpm);

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		let fn_lock = this._fn_lock = new NonClosingPopupSwitchMenuItem(_("Fn-Lock"), false); {
			fn_lock.connect('toggled', (item, state) => this._set_fn_lock(state));
		}; this.menu.addMenuItem(fn_lock);

		this.menu.connect('open-state-changed', () => this._bpm.activate());

		this._set_bpm(null, null);
		this._set_fn_lock(null);
	}

	_set_bpm(low, high) {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/charge_control_thresholds");
		if (low || high) file.replace_contents(`${low} ${high}`, null, false, 0, null);
		[low, high] = ByteArray.toString(file.load_contents(null)[1]).split(' ').map(Number);

		this._bpm.label.set_text(BPM + `: ${low}%-${high}%`);
	}

	_set_fn_lock(state) {
		let file = Gio.File.new_for_path("/sys/devices/platform/huawei-wmi/fn_lock_state");
		if (state !== null) file.replace_contents(Number(state).toString(), null, false, 0, null);
		state = Boolean(Number(ByteArray.toString(file.load_contents(null)[1])));

		this._fn_lock.setToggleState(state);
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

// by Sdore, 2021
// apps.sdore.me
