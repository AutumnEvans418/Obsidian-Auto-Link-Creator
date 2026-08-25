import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	type MarkdownFileInfo,
	type OpenViewState,
} from 'obsidian';
import { AutoLinkSettingTab, DEFAULT_SETTINGS } from './settings.ts';
import type { AutoLinkSettings } from './settings.ts';
import { PreviewSuggestModal } from './PreviewSuggestModal.ts';
import {
	linkExistingNotes,
	linkTemplateKeywords,
	processFileAndPreview,
	processVaultAndPreview,
} from './services/commandService.ts';
import type { IEditorView, IPlugin } from './services/ipluginInterface.ts';

export default class AutoLinkCreator extends Plugin {
	settings!: AutoLinkSettings;
	private originalSaveCallback: ((checking: boolean) => boolean | void) | undefined;
	private wrappedSaveCallback: ((checking: boolean) => boolean | void) | undefined;

	/**
	 * Obsidian-backed implementation of the service facade. Everything
	 * Obsidian-specific lives here; services stay unit-testable.
	 */
	private facade(
		editor?: IEditorView,
		filePath = '',
	): IPlugin {
		const app = this.app;
		const readSettings = () => this.settings;
		const folderOf = (path: string): string => {
			const cut = path.lastIndexOf('/');
			return cut === -1 ? '' : path.slice(0, cut);
		};
		const openInLeaf = async (
			file: TFile,
			state?: OpenViewState,
		): Promise<IEditorView> => {
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(file, state ?? { active: false });
			const view = leaf.view;
			if (!(view instanceof MarkdownView))
				throw new Error(`Opened ${file.path}: not a markdown view`);
			return view.editor;
		};
		const tFileAt = (path: string): TFile | null => {
			const f = app.vault.getAbstractFileByPath(path);
			return f instanceof TFile ? f : null;
		};
		// Replace the document via a transaction rather than setValue():
		// setValue resets cursor + scroll to the top; a transaction applies a
		// diff and keeps the viewport anchored.
		return {
			value: () => editor?.getValue() ?? '',
			set: (content) => {
				if (!editor) return;
				// Transaction keeps cursor + scroll; setValue resets to top.
				if (editor.transaction && editor.offsetToPos) {
					editor.transaction({
						changes: [
							{
								from: { line: 0, ch: 0 },
								to: editor.offsetToPos(editor.getValue().length),
								text: content,
							},
						],
					});
				} else {
					editor.setValue(content);
				}
			},
			notice: (msg) => new Notice(msg),
			get settings() {
				return readSettings();
			},
			folder: () => folderOf(filePath),
			source: () => filePath,

			markdownFiles: () => app.vault.getMarkdownFiles(),
			getFiles: async (f) => (await app.vault.adapter.list(f)).files,
			getFileByPath: tFileAt,
			noteAliases: (path) => {
				const f = tFileAt(path);
				const fm = f ? app.metadataCache.getFileCache(f)?.frontmatter : undefined;
				const a: unknown = fm?.['aliases'];
				if (!a) return [];
				return (Array.isArray(a) ? a : [a]).map(String).filter(Boolean);
			},
			read: (f) =>
				typeof f === 'string'
					? app.vault.adapter.read(f)
					: app.vault.cachedRead(f),
			write: async (path, data) => {
				const existing = app.vault.getAbstractFileByPath(path);
				if (existing instanceof TFile) await app.vault.modify(existing, data);
				else await app.vault.create(path, data);
			},
			modify: (file, data) => app.vault.modify(file, data),
			create: (path, data) => app.vault.create(path, data),

			openFile: openInLeaf,
			undoableWriter: () => {
				if (!readSettings().openForUndo) return undefined;
				const views = new Map<string, IEditorView>();
				return async (path, content) => {
					let ed = views.get(path);
					if (!ed) {
						const file = tFileAt(path);
						if (!file) return;
						ed = await openInLeaf(file, { active: false });
						views.set(path, ed);
					}
					ed.setValue(content);
				};
			},
			preview: (suggestions, onApply) => {
				new PreviewSuggestModal(app, suggestions, onApply, readSettings().debug).open();
			},
		};
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
				if (!checking) {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						const facade = this.facade(view.editor, view.file?.path ?? '');
						if (
							this.settings.onSaveEnabled &&
							this.settings.enableTemplateKeywords
						)
							linkTemplateKeywords(facade, true);
						if (this.settings.existingOnSave && this.settings.enableExistingLinks)
							linkExistingNotes(facade);
					}
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
				linkTemplateKeywords(this.facade(editor, ctx.file?.path ?? ''));
			},
		});

		// Preview suggested notes in a modal, then create the selected ones.
		this.addCommand({
			id: 'preview-create-notes',
			name: 'Process current file and preview links',
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				processFileAndPreview(this.facade(editor, ctx.file?.path ?? ''));
			},
		});

		// Link plain-text phrases that match existing note names/aliases.
		this.addCommand({
			id: 'link-existing-notes',
			name: 'Link existing notes in current file',
			editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				linkExistingNotes(this.facade(editor, ctx.file?.path ?? ''));
			},
		});

		// Preview suggested notes across the whole vault, creating each in its
		// closest shared folder.
		this.addCommand({
			id: 'process-whole-vault',
			name: 'Process whole vault and preview links',
			callback: () => {
				void processVaultAndPreview(this.facade());
			},
		});

		// Status bar trigger for the current-file preview (not available on mobile).
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Auto link preview');
		statusBarItemEl.addClass('auto-link-statusbar');
		this.registerDomEvent(statusBarItemEl, 'click', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice('Auto link creator: no active Markdown file');
				return;
			}
			processFileAndPreview(this.facade(view.editor, view.file?.path ?? ''));
		});

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
