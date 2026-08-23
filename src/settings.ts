import { App, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import type AutoLinkCreator from './main';
import { isValidTemplate } from './validation';

export interface AutoLinkSettings {
	/** Line patterns like `- {{Link Name}} ({{Link Alias}}) - {{Link Content}}`. First match wins. */
	templates: string[];
	/** Skip template/child-line matching inside fenced code blocks (```). */
	ignoreCodeblocks: boolean;
	/** Capitalize each first letter of note names and link text. */
	capitalize: boolean;
}

export const DEFAULT_SETTINGS: AutoLinkSettings = {
	templates: [
		'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
		'- {{Link Name}} ({{Link Alias}})',
		'- {{Link Name}} - {{Link Content}}',
	],
	ignoreCodeblocks: true,
	capitalize: true,
};

const CODEBLOCK_HELP =
	'Skip contents of fenced code blocks (```).'

const TEMPLATE_HELP =
	'One line pattern per entry. Fields: {{Link Name}}, {{Link Alias}}, {{Link Content}}. First matching template wins.';

export class AutoLinkSettingTab extends PluginSettingTab {
	plugin: AutoLinkCreator;

	constructor(app: App, plugin: AutoLinkCreator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Link templates')
			.setDesc(TEMPLATE_HELP)
			.setHeading();

		this.plugin.settings.templates.forEach((tpl, index) => {
			let field: TextAreaComponent;
			new Setting(containerEl).setName(`Template ${index + 1}`).addTextArea(
				(text) => {
					field = text;
					text.setValue(tpl).onChange(async (value) => {
						if (!isValidTemplate(value)) {
							text.inputEl.addClass('mod-error');
							return;
						}
						text.inputEl.removeClass('mod-error');
						this.plugin.settings.templates[index] = value;
						await this.plugin.saveSettings();
					});
				},
			).addExtraButton((btn) =>
				btn
					.setIcon('trash-2')
					.setTooltip('Delete template')
					.onClick(async () => {
						this.plugin.settings.templates.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}),
			);
			field!.inputEl.rows = 2;
			field!.inputEl.cols = 50;
		});

		new Setting(containerEl)
			.setName('Ignore code blocks')
			.setDesc(CODEBLOCK_HELP)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ignoreCodeblocks)
					.onChange(async (value) => {
						this.plugin.settings.ignoreCodeblocks = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Capitalize names')
			.setDesc('Capitalize each first letter of note names and link text.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.capitalize)
					.onChange(async (value) => {
						this.plugin.settings.capitalize = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).addExtraButton((btn) =>
			btn
				.setIcon('plus')
				.setTooltip('Add template')
				.onClick(async () => {
					this.plugin.settings.templates.push('');
					await this.plugin.saveSettings();
					this.display();
				}),
		);
	}
}
