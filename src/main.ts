import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	type MarkdownFileInfo,
} from 'obsidian';
import { AutoLinkSettingTab, DEFAULT_SETTINGS } from './settings';
import type { AutoLinkSettings } from './settings';
import { rootForm, singularize } from './nlp';
import { findAllByTemplates, groupByReference, groupContent } from './template';
import type { ParsedTemplate } from './template';
import { applyLinks } from './link';
import { createNote } from './creator';
import PreviewModal from './ui/PreviewModal.svelte';
import { mount, unmount } from 'svelte';
import type { Suggestion } from './ui/suggestion';

export default class AutoLinkCreator extends Plugin {
	settings!: AutoLinkSettings;

	async onload() {
		await this.loadSettings();

		// TEMP: verify nlp-compromise bundled + loads inside Obsidian. Remove when real UI landed.
		this.addRibbonIcon('link', 'Test nlp-comprromise', () => {
			new Notice(`nlp loaded. changed→${rootForm('changed')}. Cows→${singularize('Cows')}`);
		});
		this.addCommand({
			id: 'test-nlp-load',
			name: 'Test nlp-compromise loads',
			callback: () => {
				new Notice(`changed→${rootForm('changed')}. Cows→${singularize('Cows')}`);
			},
		});

		// TEMP: debug template parser on active file. Remove once wired to real UI.
		const TEMPLATES = [
			'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
			'- {{Link Name}} ({{Link Alias}})\n  - {{Link Content}}',
		];
		this.addCommand({
			id: 'debug-template-parse',
			name: 'Debug: parse templates on active file',
			editorCallback: (editor: Editor) => {
				const doc = editor.getValue();
				for (const hit of findAllByTemplates(doc, TEMPLATES)) {
					console.log('[auto-link]', hit);
				}
			},
		});

		// Convert matched template blocks in the active file into wiki links.
		this.addCommand({
			id: 'convert-keywords-to-links',
			name: 'Convert keywords to links',
			editorCallback: (editor: Editor) => {
				const doc = editor.getValue();
				const hits: ParsedTemplate[] = findAllByTemplates(doc, this.settings.templates, {
					ignoreCodeblocks: this.settings.ignoreCodeblocks,
				});
				if (!hits.length) {
					new Notice('No template matches found.');
					return;
				}
				editor.setValue(applyLinks(doc, hits, this.settings.capitalize));
				new Notice(`Linked ${hits.length} keyword(s).`);
			},
		});

		// TEMP: create target notes for active file's template hits. Remove when real UI landed.
		this.addCommand({
			id: 'debug-create-notes',
			name: 'Debug: create notes for template hits',
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				const doc = editor.getValue();
				const folder = ctx.file ? ctx.file.parent?.path ?? '' : '';
				let created = 0;
				let appended = 0;
				void (async () => {
					try {
						const groups = groupByReference(
							findAllByTemplates(doc, this.settings.templates, {
								ignoreCodeblocks: this.settings.ignoreCodeblocks,
							}),
						);
						for (const group of groups) {
							const lead = group[0];
							if (!lead) continue;
							const aliases = group
								.slice(1)
								.map((h) => h.name)
								.filter((n) => n !== lead.name);
							const res = await createNote(
								this.app.vault,
								folder,
								{ ...lead, aliases },
								this.settings.capitalize,
							);
							if (res.created) created++;
							else appended++;
						}
						new Notice(`Created ${created}, appended ${appended}.`);
					} catch (err) {
						new Notice(`Auto Link Creator error: ${String(err)}`);
					}
				})();
			},
		});

		// Preview suggested notes in a modal, then create the selected ones.
		this.addCommand({
			id: 'preview-create-notes',
			name: 'Preview suggested notes',
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				const doc = editor.getValue();
				const folder = ctx.file ? ctx.file.parent?.path ?? '' : '';
				const suggestions = collectSuggestions(
					findAllByTemplates(doc, this.settings.templates, {
						ignoreCodeblocks: this.settings.ignoreCodeblocks,
					}),
				);
				if (!suggestions.length) {
					new Notice('No template matches found.');
					return;
				}
				const modal = new PreviewSuggestModal(this.app, suggestions, async (indices) => {
					let created = 0;
					let appended = 0;
					const toLink: ParsedTemplate[] = [];
					for (const i of indices) {
						const s = suggestions[i];
						if (!s) continue;
						for (const h of s.hits) toLink.push(h);
						try {
							const res = await createNote(
								this.app.vault,
								folder,
								{ name: s.name, content: s.content, aliases: s.aliases },
								this.settings.capitalize,
							);
							if (res.created) created++;
							else appended++;
						} catch (err) {
							new Notice(`Auto Link Creator error: ${String(err)}`);
						}
					}
					if (toLink.length) {
						editor.setValue(applyLinks(editor.getValue(), toLink, this.settings.capitalize));
						new Notice(
							`Created ${created}, appended ${appended}. Linked ${toLink.length} keyword(s).`,
						);
					} else {
						new Notice(`Created ${created}, appended ${appended}.`);
					}
				});
				modal.open();
			},
		});

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Sample', (_evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!asdf');
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new TemplateModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo,
			) => {
				editor.replaceSelection('Sample editor command');
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new TemplateModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoLinkSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AutoLinkSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function collectSuggestions(hits: ParsedTemplate[]): Suggestion[] {
	return groupByReference(hits).map((group) => {
		const lead = group[0];
		const rest = group.slice(1);
		const aliases = rest.map((h) => h.name).filter((n) => n !== lead?.name);
		return { name: lead?.name ?? '', aliases, content: groupContent(group), hits: group };
	});
}

class PreviewSuggestModal extends Modal {
	private comp: ReturnType<typeof mount> | undefined;

	constructor(
		app: App,
		private suggestions: Suggestion[],
		private onApply: (indices: number[]) => Promise<void>,
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('alc-preview');
		this.comp = mount(PreviewModal, {
			target: contentEl,
			props: {
				suggestions: this.suggestions,
				onApply: (indices: number[]) => {
					void this.onApply(indices).then(() => this.close());
				},
				onCancel: () => this.close(),
			},
		});
	}

	onClose() {
		if (this.comp) unmount(this.comp);
		this.contentEl.empty();
	}
}

class TemplateModal extends Modal {
	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
