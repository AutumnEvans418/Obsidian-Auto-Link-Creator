import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	type MarkdownFileInfo,
} from 'obsidian';
import { AutoLinkSettingTab, DEFAULT_SETTINGS } from './settings';
import type { AutoLinkSettings } from './settings';
import { rootForm, singularize } from './nlp';
import { findAllByTemplates } from './template';
import type { ParsedTemplate } from './template';
import { applyLinks } from './link';
import { createNote } from './creator';
import type { Suggestion } from './ui/suggestion';
import { PreviewSuggestModal } from './PreviewSuggestModal';
import { collectSuggestions } from './collectSuggestions';
import { collectVaultSuggestions } from './collectVaultSuggestions';
import { makeUndoableWrite } from './makeUndoableWrite';
import { nlpSuggestions } from './nlpSuggestions';
import { linkTemplateKeywords, processFileAndPreview } from './services/commandService';
import type { IPlugin } from './services/ipluginInterface';

export default class AutoLinkCreator extends Plugin {
	settings!: AutoLinkSettings;
	private originalSaveCallback: ((checking: boolean) => any) | undefined;
	private wrappedSaveCallback: ((checking: boolean) => any) | undefined;

	pluginInterface(editor: Editor, ctx: MarkdownView | MarkdownFileInfo): IPlugin {
		return {
			value: editor.getValue(),
			set: v => editor.setValue(v),
			notice: msg => new Notice(msg),
			settings: this.settings,
			folder: ctx.file ? ctx.file.parent?.path ?? '' : '',
		}
	}

	async onload() {
		await this.loadSettings();

		// Format-on-save: wrap the built-in save command so linked template
		// keywords are converted right after a save. Mirrors kdnk/obsidian-
		// automatic-linker (override `editor:save-file`'s checkCallback).
		const saveDef = this.app.commands?.commands?.['editor:save-file'];
		const saveCallback = saveDef?.checkCallback;
		if (saveDef && typeof saveCallback === 'function') {
			this.originalSaveCallback = saveCallback;
			this.wrappedSaveCallback = (checking: boolean) => {
				const res = saveCallback(checking);
				if (
					!checking &&
					this.settings.onSaveEnabled &&
					this.settings.enableTemplateKeywords
				) {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) linkTemplateKeywords(this.pluginInterface(view.editor, view), true);
				}
				return res;
			};
			saveDef.checkCallback = this.wrappedSaveCallback;
		}

		// Convert matched template blocks in the active file into wiki links.
		this.addCommand({
			id: 'convert-keywords-to-links',
			name: 'Process current file without preview',
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				if (!this.settings.enableTemplateKeywords) return;
				linkTemplateKeywords(this.pluginInterface(editor, ctx));
			},
		});

		// Preview suggested notes in a modal, then create the selected ones.
		this.addCommand({
			id: 'preview-create-notes',
			name: 'Process current file and preview links',
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				processFileAndPreview(this.pluginInterface(editor, ctx));
			},
		});

		// Preview suggested notes across the whole vault, creating each in its
		// closest shared folder.
		this.addCommand({
			id: 'process-whole-vault',
			name: 'Process whole vault and preview links',
			callback: () => {
				void (async () => {
					const suggestions = await collectVaultSuggestions(this.app, this.settings);
					if (!suggestions.length) {
						new Notice('No keyword matches found in the vault.');
						return;
					}
					const modal = new PreviewSuggestModal(this.app, suggestions, async (indices) => {
						const onWrite = this.settings.openForUndo
							? makeUndoableWrite(this.app)
							: undefined;
						let created = 0;
						let appended = 0;
						for (const i of indices) {
							const s = suggestions[i];
							if (!s) continue;
							try {
								const res = await createNote(
									this.app.vault,
									s.targetFolder ?? '',
									{ name: s.name, content: s.content, aliases: s.aliases },
									this.settings.capitalize,
									onWrite,
								);
								if (res.created) created++;
								else appended++;
							} catch (err) {
								new Notice(`Auto Link Creator error: ${String(err)}`);
							}
						}
						let linked = 0;
						if (this.settings.enableTemplateKeywords) {
							// Link each selected template suggestion's lines in the
							// files that use them.
							const selected = indices
								.map((i) => suggestions[i])
								.filter((s) => s && s.hits.length);
							const toLink = new Set(selected.map((s) => rootForm(s!.name.toLowerCase())));
							const nameByRoot = new Map(
								selected.map((s) => [rootForm(s!.name.toLowerCase()), s!.name]),
							);
							if (toLink.size) {
								for (const file of this.app.vault.getMarkdownFiles()) {
									const doc = await this.app.vault.read(file);
									const hits = findAllByTemplates(doc, this.settings.templates, {
										ignoreCodeblocks: this.settings.ignoreCodeblocks,
									})
										.map((h) => {
											const root = rootForm(h.name.toLowerCase());
											if (toLink.has(root)) {
												const target = nameByRoot.get(root);
												if (target && target !== h.name) h.target = target;
											}
											return h;
										})
										.filter((h) => toLink.has(rootForm(h.name.toLowerCase())));
									if (!hits.length) continue;
									const updated = applyLinks(doc, hits, this.settings.capitalize);
									if (updated === doc) continue;
									if (onWrite) await onWrite(file.path, updated);
									else await this.app.vault.modify(file, updated);
									linked += hits.length;
								}
							}
						}
						new Notice(`Created ${created}, appended ${appended}. Linked ${linked} keyword(s).`);
					});
					modal.open();
				})();
			},
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoLinkSettingTab(this.app, this));
	}

	onunload() {
		if (this.originalSaveCallback) {
			const saveDef = this.app.commands?.commands?.['editor:save-file'];
			if (saveDef && saveDef.checkCallback === this.wrappedSaveCallback) {
				saveDef.checkCallback = this.originalSaveCallback;
			}
		}
	}

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


