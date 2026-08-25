import { App, PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import type AutoLinkCreator from './main.ts';
import { isValidTemplate } from './validation.ts';
import { DEFAULT_SETTINGS } from './settingsSchema.ts';
import type { AutoLinkSettings } from './settingsSchema.ts';

export { DEFAULT_SETTINGS };
export type { AutoLinkSettings };

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
			.setHeading()
			.addExtraButton((btn) =>
				btn
					.setIcon('plus')
					.setTooltip('Add template')
					.onClick(async () => {
						this.plugin.settings.templates.push('');
						await this.plugin.saveSettings();
						this.display();
					}),
			);

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

		new Setting(containerEl).setName('Keyword sources').setHeading();

		new Setting(containerEl)
			.setName('Template-based keywords')
			.setDesc('Detect keywords from `{{Link ...}}` template lines.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableTemplateKeywords)
					.onChange(async (value) => {
						this.plugin.settings.enableTemplateKeywords = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('NLP-based keywords')
			.setDesc(
				'Scan note prose for repeated, useful phrases (normalized: plural, singular, lemmatized forms grouped together).',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableNlpKeywords)
					.onChange(async (value) => {
						this.plugin.settings.enableNlpKeywords = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Preview keyword findings')
			.setDesc('Which findings the preview presents: template lines, repeated-phrase keywords, or both.')
			.addDropdown((drop) =>
				drop
					.addOption('both', 'Both')
					.addOption('template', 'Template')
					.addOption('nlp', 'NLP')
					.setValue(this.plugin.settings.previewKeywords)
					.onChange(async (value) => {
						this.plugin.settings.previewKeywords = value as 'both' | 'template' | 'nlp';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Extra stop words')
			.setDesc(
				'Comma-separated words for NLP keyword detection to ignore. E.g. project, team, feature',
			)
			.addText((text) =>
				text
					.setPlaceholder('project, team, feature')
					.setValue(this.plugin.settings.extraStopwords)
					.onChange(async (value) => {
						this.plugin.settings.extraStopwords = value;
						await this.plugin.saveSettings();
					}),
			);

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
			.setName('Ignore dates')
			.setDesc('Skip date/number-like phrases (e.g. 2026, 2026-08-24) when linking.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ignoreDates)
					.onChange(async (value) => {
						this.plugin.settings.ignoreDates = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Link on save')
			.setDesc(
				'Automatically convert template keywords to wiki links when a template-based-keyword note is saved. Idempotent: already-linked phrases are skipped.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.onSaveEnabled)
					.onChange(async (value) => {
						this.plugin.settings.onSaveEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Open files for undo')
			.setDesc(
				'Open notes that get content appended in background tabs (without changing the active note) so the built-in Undo can revert them.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openForUndo)
					.onChange(async (value) => {
						this.plugin.settings.openForUndo = value;
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

		new Setting(containerEl)
			.setName('Debug details in preview')
			.setDesc(
				'Show provenance for each suggestion: source file/line, matched template, and nlp root.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Existing notes').setHeading();

		new Setting(containerEl)
			.setName('Link existing notes')
			.setDesc(
				'Link phrases that match an existing note name or alias (from the metadata cache) to that note.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableExistingLinks)
					.onChange(async (value) => {
						this.plugin.settings.enableExistingLinks = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Match mode')
			.setDesc(
				'Exact: only the note name/alias text matches. NLP root: plural/singular/lemmatized variants match too (e.g. "cows" links to "Cow").',
			)
			.addDropdown((drop) =>
				drop
					.addOption('exact', 'Exact')
					.addOption('root', 'NLP root')
					.setValue(this.plugin.settings.existingMatchMode)
					.onChange(async (value) => {
						this.plugin.settings.existingMatchMode = value as 'exact' | 'root';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Link existing notes on save')
			.setDesc(
				'Automatically link existing-note matches when a note is saved. Idempotent: already-linked phrases are skipped.',
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.existingOnSave)
					.onChange(async (value) => {
						this.plugin.settings.existingOnSave = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
