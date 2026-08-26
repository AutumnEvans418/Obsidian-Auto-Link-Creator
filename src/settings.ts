import { App, PluginSettingTab, Setting, TextAreaComponent, type SettingDefinitionItem } from 'obsidian';
import type AutoLinkCreator from './main.ts';
import { isValidTemplate } from './validation.ts';
import { DEFAULT_SETTINGS } from './settingsSchema.ts';
import type { AutoLinkSettings } from './settingsSchema.ts';

export { DEFAULT_SETTINGS };
export type { AutoLinkSettings };

const CODEBLOCK_HELP =
	'Skip contents of fenced code blocks (```).';

const TEMPLATE_HELP =
	'One line pattern per entry. Fields: {{Link Name}}, {{Link Alias}}, {{Link Content}}. First matching template wins.';

export class AutoLinkSettingTab extends PluginSettingTab {
	plugin: AutoLinkCreator;

	constructor(app: App, plugin: AutoLinkCreator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const plugin = this.plugin;
		const defs: SettingDefinitionItem[] = [];

		defs.push({
			name: 'Link templates',
			desc: TEMPLATE_HELP,
			action: () => {
				plugin.settings.templates.push('');
				void plugin.saveSettings().then(() => this.update());
			},
		});

		for (let index = 0; index < plugin.settings.templates.length; index++) {
			const tpl = plugin.settings.templates[index]!;
			defs.push({
				name: `Template ${index + 1}`,
				render: (setting: Setting) => {
					let field: TextAreaComponent;
					setting.addTextArea((text) => {
						field = text;
						text.setValue(tpl).onChange(async (value) => {
							if (!isValidTemplate(value)) {
								text.inputEl.addClass('mod-error');
								return;
							}
							text.inputEl.removeClass('mod-error');
							plugin.settings.templates[index] = value;
							await plugin.saveSettings();
						});
					}).addExtraButton((btn) =>
						btn
							.setIcon('trash-2')
							.setTooltip('Delete template')
							.onClick(async () => {
								plugin.settings.templates.splice(index, 1);
								await plugin.saveSettings();
								this.update();
							}),
					);
					field!.inputEl.rows = 2;
					field!.inputEl.cols = 50;
				},
			});
		}

		defs.push({ name: 'Keyword sources', heading: 'Keyword sources' });

		defs.push({
			name: 'Template-based keywords',
			control: {
				type: 'toggle',
				key: 'enableTemplateKeywords',
			},
		});

		defs.push({
			name: 'NLP-based keywords',
			desc: 'Scan note prose for repeated, useful phrases (normalized: plural, singular, lemmatized forms grouped together).',
			control: {
				type: 'toggle',
				key: 'enableNlpKeywords',
			},
		});

		defs.push({
			name: 'Extra stop words',
			desc: 'Comma-separated words for NLP keyword detection to ignore. E.g. project, team, feature',
			render: (setting: Setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder('Project, team, feature')
						.setValue(plugin.settings.extraStopwords)
						.onChange(async (value) => {
							plugin.settings.extraStopwords = value;
							await plugin.saveSettings();
						}),
				);
			},
		});

		defs.push({
			name: 'Ignore code blocks',
			desc: CODEBLOCK_HELP,
			control: {
				type: 'toggle',
				key: 'ignoreCodeblocks',
			},
		});

		defs.push({
			name: 'Ignore dates',
			desc: 'Skip date/number-like phrases (e.g. 2026, 2026-08-24) when linking.',
			control: {
				type: 'toggle',
				key: 'ignoreDates',
			},
		});

		defs.push({
			name: 'Link on save',
			desc: 'Automatically convert template keywords to wiki links when a template-based-keyword note is saved. Idempotent: already-linked phrases are skipped.',
			control: {
				type: 'toggle',
				key: 'onSaveEnabled',
			},
		});

		defs.push({
			name: 'Open files for undo',
			desc: 'Open notes that get content appended in background tabs (without changing the active note) so the built-in Undo can revert them.',
			control: {
				type: 'toggle',
				key: 'openForUndo',
			},
		});

		defs.push({
			name: 'Capitalize names',
			desc: 'Capitalize each first letter of note names and link text.',
			control: {
				type: 'toggle',
				key: 'capitalize',
			},
		});

		defs.push({
			name: 'Debug details in preview',
			desc: 'Show provenance for each suggestion: source file/line, matched template, and nlp root.',
			control: {
				type: 'toggle',
				key: 'debug',
			},
		});

		defs.push({ name: 'Note creation', heading: 'Note creation' });

		defs.push({
			name: 'New note folder',
			desc: "Folder name new notes go into. Blank: the current note's own folder.",
			render: (setting: Setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder('Concepts')
						.setValue(plugin.settings.newNoteFolder)
						.onChange(async (value) => {
							plugin.settings.newNoteFolder = value;
							await plugin.saveSettings();
						}),
				);
			},
		});

		defs.push({
			name: 'New folder mode',
			desc: 'Subfolder: create the folder inside the current note directory. Closest shared folder: reuse the nearest existing folder of that name, walking up; if none exists you are prompted for where to create it.',
			control: {
				type: 'dropdown',
				key: 'newFolderMode',
				options: {
					subfolder: 'Subfolder',
					closest: 'Closest shared folder',
				},
			},
		});

		defs.push({ name: 'Existing notes', heading: 'Existing notes' });

		defs.push({
			name: 'Link existing notes',
			desc: 'Link phrases that match an existing note name or alias (from the metadata cache) to that note.',
			control: {
				type: 'toggle',
				key: 'enableExistingLinks',
			},
		});

		defs.push({
			name: 'Match mode',
			desc: 'Exact: only the note name/alias text matches. NLP root: plural/singular/lemmatized variants match too (e.g. "cows" links to "Cow").',
			control: {
				type: 'dropdown',
				key: 'existingMatchMode',
				options: {
					exact: 'Exact',
					root: 'NLP root',
				},
			},
		});

		defs.push({
			name: 'Link existing notes on save',
			desc: 'Automatically link existing-note matches when a note is saved. Idempotent: already-linked phrases are skipped.',
			control: {
				type: 'toggle',
				key: 'existingOnSave',
			},
		});

		defs.push({
			name: 'Link existing notes while typing',
			desc: 'Automatically link existing-note matches after a typing pause. Idempotent: already-linked phrases are skipped.',
			control: {
				type: 'toggle',
				key: 'linkOnEditEnabled',
			},
		});

		defs.push({
			name: 'Typing pause delay (seconds)',
			desc: 'How long to wait after the last keystroke before linking.',
			control: {
				type: 'slider',
				key: 'linkOnEditTimeout',
				min: 1,
				max: 30,
				step: 1,
			},
			visible: () => plugin.settings.linkOnEditEnabled,
		});

		defs.push({
			name: 'Link unresolved wikilinks',
			desc: 'Also index link targets from wikilinks whose notes do not exist yet (e.g. [[FileB]] in another file) so plain-text mentions of those names get linked too.',
			control: {
				type: 'toggle',
				key: 'linkUnresolved',
			},
		});

		return defs;
	}
}
