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
import { extractKeywords, extractKeywordsFromDocs } from './keywords';
import { closestCommonFolder } from './folders';
import PreviewModal from './ui/PreviewModal.svelte';
import { mount, unmount } from 'svelte';
import type { Suggestion } from './ui/suggestion';

export default class AutoLinkCreator extends Plugin {
	settings!: AutoLinkSettings;
	private originalSaveCallback: ((checking: boolean) => any) | undefined;
	private wrappedSaveCallback: ((checking: boolean) => any) | undefined;

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
					if (view) this.linkTemplateKeywords(view.editor, true);
				}
				return res;
			};
			saveDef.checkCallback = this.wrappedSaveCallback;
		}

		// Convert matched template blocks in the active file into wiki links.
		this.addCommand({
			id: 'convert-keywords-to-links',
			name: 'Convert keywords to links',
			editorCallback: (editor: Editor) => {
				if (!this.settings.enableTemplateKeywords) return;
				this.linkTemplateKeywords(editor);
			},
		});

		// TEMP: create target notes for active file's template hits. Remove when real UI landed.
		this.addCommand({
			id: 'debug-create-notes',
			name: 'Debug: create notes for template hits',
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				if (!this.settings.enableTemplateKeywords) return;
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
				const suggestions: Suggestion[] = [];
				if (this.settings.enableTemplateKeywords) {
					suggestions.push(
						...collectSuggestions(
							findAllByTemplates(doc, this.settings.templates, {
								ignoreCodeblocks: this.settings.ignoreCodeblocks,
							}),
						),
					);
				}
				if (this.settings.enableNlpKeywords) {
					const extra = this.settings.extraStopwords.split(',').map((s) => s.trim()).filter(Boolean);
					suggestions.push(...nlpSuggestions(doc, extra));
				}
				if (!suggestions.length) {
					new Notice('No keyword matches found.');
					return;
				}
				const modal = new PreviewSuggestModal(this.app, suggestions, async (indices) => {
					let created = 0;
					let appended = 0;
					const toLink: ParsedTemplate[] = [];
					const onWrite = this.settings.openForUndo
						? makeUndoableWrite(this.app)
						: undefined;
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
								onWrite,
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

		// Preview suggested notes across the whole vault, creating each in its
		// closest shared folder.
		this.addCommand({
			id: 'process-whole-vault',
			name: 'Process whole vault (preview)',
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

	/** Rewrite template keyword lines in `editor` into wiki links, idempotently. */
	linkTemplateKeywords(editor: Editor, quiet = false): void {
		const doc = editor.getValue();
		const hits = findAllByTemplates(doc, this.settings.templates, {
			ignoreCodeblocks: this.settings.ignoreCodeblocks,
		});
		if (!hits.length) {
			if (!quiet) new Notice('No template matches found.');
			return;
		}
		editor.setValue(applyLinks(doc, hits, this.settings.capitalize));
		new Notice(`Linked ${hits.length} keyword(s).`);
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

/** NLP has no content template: suggestions only create notes + variant aliases. */
function nlpSuggestions(doc: string, extraStopwords: string[] = []): Suggestion[] {
	return extractKeywords(doc, { extraStopwords }).map((k) => ({
		name: k.name,
		aliases: k.aliases,
		count: k.count,
		hits: [],
	}));
}

/**
 * Build an `onWrite` that opens each appended-to file in a non-focusing leaf
 * and replaces its content through the editor, so Obsidian records a native
 * Ctrl-Z undo step for the change.
 */
function makeUndoableWrite(app: App): (path: string, content: string) => Promise<void> {
	const views = new Map<string, MarkdownView>();
	return async (path: string, content: string) => {
		let view = views.get(path);
		if (!view) {
			const file = app.vault.getFileByPath(path);
			if (!file) return;
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(file, { active: false });
			view = leaf.view as MarkdownView;
			views.set(path, view);
		}
		view.editor.setValue(content);
	};
}

/** Merge per-file hits into vault-wide suggestions with resolved folders. */
async function collectVaultSuggestions(
	app: App,
	s: AutoLinkSettings,
): Promise<Suggestion[]> {
	const extra = s.extraStopwords.split(',').map((x) => x.trim()).filter(Boolean);
	// Existing note names keyed by root form, so variant forms fold onto them.
	const existingNotes = new Map<string, string>();
	for (const f of app.vault.getMarkdownFiles()) {
		const bare = f.basename;
		existingNotes.set(rootForm(bare.toLowerCase()), bare);
	}
	const acc = new Map<
		string,
		{
			name: string;
			aliases: Set<string>;
			contents: string[];
			hits: ParsedTemplate[];
			files: Set<string>;
			count: number;
		}
	>();
	const entry = (name: string) => {
		const preferred = existingNotes.get(rootForm(name.toLowerCase()));
		const resolved = preferred ?? name;
		const e = { name: resolved, aliases: new Set<string>(), contents: [], hits: [], files: new Set<string>(), count: 0 };
		acc.set(rootForm(name.toLowerCase()), e);
		return e;
	};

	// NLP: map every phrase to the files it appears in, using a per-file scan
	// with minimum frequency 1 so membership is tracked even for cross-file
	// phrases that never repeat within one note.
	const nlpFiles = new Map<string, Set<string>>();
	const docs: string[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const doc = await app.vault.read(file);
		docs.push(doc);
		if (s.enableTemplateKeywords) {
			for (const group of groupByReference(
				findAllByTemplates(doc, s.templates, { ignoreCodeblocks: s.ignoreCodeblocks }),
			)) {
				const lead = group[0];
				if (!lead) continue;
				const e = acc.get(rootForm(lead.name.toLowerCase())) ?? entry(lead.name);
				for (const h of group) {
					if (h.name !== e.name) e.aliases.add(h.name);
					if (h.alias && h.alias !== e.name) e.aliases.add(h.alias);
				}
				e.hits.push(...group);
				e.files.add(file.path);
				e.count += group.length;
				const content = groupContent(group);
				if (content && !e.contents.includes(content)) e.contents.push(content);
			}
		}
		if (s.enableNlpKeywords) {
			for (const k of extractKeywords(doc, { extraStopwords: extra, minFreq: 1 })) {
				const set = nlpFiles.get(k.name.toLowerCase()) ?? new Set<string>();
				set.add(file.path);
				nlpFiles.set(k.name.toLowerCase(), set);
			}
		}
	}

	if (s.enableNlpKeywords) {
		for (const k of extractKeywordsFromDocs(docs, { extraStopwords: extra })) {
			const e = acc.get(rootForm(k.name.toLowerCase())) ?? entry(k.name);
			for (const a of k.aliases) if (a !== e.name) e.aliases.add(a);
			for (const f of nlpFiles.get(k.name.toLowerCase()) ?? []) e.files.add(f);
			e.count += k.count;
		}
	}

	return [...acc.values()].map((e) => {
		const files = [...e.files];
		return {
			name: e.name,
			aliases: [...e.aliases],
			content: e.contents.length ? e.contents.join('\n\n') : undefined,
			count: e.count,
			hits: e.hits,
			sourceFiles: files,
			targetFolder: closestCommonFolder(files),
		};
	});
}

function collectSuggestions(hits: ParsedTemplate[]): Suggestion[] {
	return groupByReference(hits).map((group) => {
		const lead = group[0];
		const rest = group.slice(1);
		const aliases = rest.map((h) => h.name).filter((n) => n !== lead?.name);
		return {
			name: lead?.name ?? '',
			aliases,
			content: groupContent(group),
			count: group.length,
			hits: group,
		};
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
