import Adw from 'gi://Adw';

import {
	ExtensionPreferences,
	gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HuaweiWmiPreferences extends ExtensionPreferences {
	fillPreferencesWindow(window) {
		let settings = this.getSettings();
		let page = new Adw.PreferencesPage({
			title: _('Quick Settings'),
			icon_name: 'preferences-system-symbolic',
		});
		let group = new Adw.PreferencesGroup({
			title: _('Huawei WMI controls'),
			description: _('Choose which controls are available in Quick Settings.'),
		});

		let fnLock = new Adw.SwitchRow({ title: _('Fn-Lock tile') });
		let batteryMode = new Adw.SwitchRow({ title: _('Battery mode tile') });

		if (settings.settings_schema.has_key('show-fn-lock-tile'))
			settings.bind('show-fn-lock-tile', fnLock, 'active', 0);
		if (settings.settings_schema.has_key('show-battery-mode-tile'))
			settings.bind('show-battery-mode-tile', batteryMode, 'active', 0);

		group.add(fnLock);
		group.add(batteryMode);
		page.add(group);
		window.add(page);
	}
}
