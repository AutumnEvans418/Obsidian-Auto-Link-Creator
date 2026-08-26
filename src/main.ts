import {
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	TFile,
	TFolder,
	type App,
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

/** Blocking indicator shown while a preview scan runs. */
class LoadingModal extends Modal {
	constructor(
		app: App,
		private label: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText('Auto link creator');
		this.contentEl.createDiv('alcm-loading');
		const text = this.contentEl.createDiv('alcm-loading-text');
		text.setText(this.label);
	}
}

/** Ask the user for a folder path; resolves null on cancel/empty. */
class FolderPromptModal extends Modal {
	constructor(
		app: App,
		private def: string,
		private done: (value: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText('Folder for new notes');
		const input = this.contentEl.createEl('input', { type: 'text' });
		input.value = this.def;
		input.addClass('alcm-folder-input');
		const submit = () => {
			const v = input.value.trim();
			this.close();
			this.done(v || null);
		};
		const btns = this.contentEl.createDiv('modal-button-container');
		const ok = btns.createEl('button', { text: 'Create here' });
		ok.addClass('mod-cta');
		ok.addEventListener('click', submit);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') submit();
		});
	}
}

export default class AutoLinkCreator extends Plugin {
	settings!: AutoLinkSettings;
	private originalSaveCallback: ((checking: boolean) => boolean | void) | undefined;
	private wrappedSaveCallback: ((checking: boolean) => boolean | void) | undefined;

	/**
	 * Obsidian-backed implementation of the service facade. Everything
	 * Obsidian-specific lives here; services stay unit-testable.
	 */
	/** Show a loading modal for the duration of an async scan. */
	private async withLoading(label: string, run: () => void | Promise<void>): Promise<void> {
		const loading = new LoadingModal(this.app, label);
		loading.open();
		// The scan blocks the thread; yield a frame so the modal paints first.
		await new Promise<void>((r) =>
			window.requestAnimationFrame(() => window.setTimeout(r, 0)));
		try {
			await run();
		} finally {
			loading.close();
		}
	}

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
				const scroll = editor.getScrollInfo?.();
				const cursor = editor.getCursor?.('head');
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
				// Defer restore so Obsidian's post-save layout settles first.
				window.requestAnimationFrame(() => {
					if (scroll && editor.scrollTo) editor.scrollTo(scroll.top, scroll.left);
					if (cursor && editor.setCursor) editor.setCursor(cursor);
				});
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
			unresolvedLinks: () => {
				const names = new Set<string>();
				for (const source of Object.values(app.metadataCache.unresolvedLinks)) {
					for (const target of Object.keys(source)) names.add(target);
				}
				return [...names];
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
			create: async (path, data) => {
				// New-note folders may not exist yet (e.g. a Concepts subfolder).
				const cut = path.lastIndexOf('/');
				if (cut > 0 && !app.vault.getAbstractFileByPath(path.slice(0, cut)))
					await app.vault.createFolder(path.slice(0, cut));
				return app.vault.create(path, data);
			},
			folderExists: (p) => {
				if (!p) return true;
				const f = app.vault.getAbstractFileByPath(p);
				return f instanceof TFolder;
			},
			promptFolder: (def) =>
				new Promise<string | null>((resolve) =>
					new FolderPromptModal(app, def, resolve).open(),
				),

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
			void this.withLoading('Scanning current file…', () =>
				processFileAndPreview(this.facade(editor, ctx.file?.path ?? '')));
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
			void this.withLoading('Scanning vault…', () => processVaultAndPreview(this.facade()));
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
			void this.withLoading('Scanning current file…', () =>
				processFileAndPreview(this.facade(view.editor, view.file?.path ?? '')));
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
