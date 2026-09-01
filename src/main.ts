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
import { minimalChanges } from './textDiff.ts';
import {
	applyDocChange,
	deserializeVaultCache,
	makeVaultCache,
	pruneVaultCache,
	serializeVaultCache,
	vaultSuggestions,
	type VaultNlpCache,
} from './vaultNlpCache.ts';
import type { NlpOptions } from './keywords.ts';

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
	private linkTimers: Record<string, number> = {};

	/** Per-file n-gram cache for vault-context NLP (persisted across reloads). */
	private vaultCache: VaultNlpCache = makeVaultCache();
	private cacheSaveTimer: number | undefined;

	/** Adapter file storing the vault n-gram cache (kept out of settings data). */
	private cachePath(): string {
		const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		return `${dir}/vault-nlp-cache.json`;
	}

	private async loadVaultCache(): Promise<void> {
		try {
			const raw = await this.app.vault.adapter.read(this.cachePath());
			const data = JSON.parse(raw) as Parameters<typeof deserializeVaultCache>[0];
			this.vaultCache = deserializeVaultCache(data);
		} catch {
			this.vaultCache = makeVaultCache();
		}
	}

	/** Debounced persist of the cache to its adapter file. */
	private scheduleCacheSave(): void {
		if (this.cacheSaveTimer !== undefined) window.clearTimeout(this.cacheSaveTimer);
		this.cacheSaveTimer = window.setTimeout(() => {
			this.cacheSaveTimer = undefined;
			void this.saveVaultCache();
		}, 500);
	}

	private async saveVaultCache(): Promise<void> {
		try {
			const raw = JSON.stringify(serializeVaultCache(this.vaultCache));
			await this.app.vault.adapter.write(this.cachePath(), raw);
		} catch {
			// Cache is a best-effort speedup; a failed persist is non-fatal.
		}
	}

	/**
	 * Reconcile the cache with the vault: recount any file whose mtime changed
	 * (or that's new under these NLP opts) without reading unchanged ones, and
	 * drop entries for deleted files. Persists after the pass.
	 */
	private async ensureVaultCache(opts: NlpOptions): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		const existing = new Set<string>();
		for (const f of files) {
			existing.add(f.path);
			const stat = f.stat?.mtime ?? 0;
			if (stat > 0) {
				const doc = await this.app.vault.cachedRead(f);
				applyDocChange(this.vaultCache, f.path, stat, doc, opts);
			}
		}
		pruneVaultCache(this.vaultCache, existing);
		this.scheduleCacheSave();
	}

	private vaultContextSuggestionsFor(
		source: string,
		doc: string,
		opts: NlpOptions,
	): import('./ui/suggestion.ts').Suggestion[] {
		return vaultSuggestions(this.vaultCache, source, doc, opts);
	}

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
			// getLeaf(false) reuses the active leaf and would navigate the user
			// away; 'tab' spawns a dedicated background leaf, and active:false
			// keeps focus on the current note.
			const leaf = app.workspace.getLeaf('tab');
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
				const oldDoc = editor.getValue();
				if (content === oldDoc) return;
				if (editor.transaction) {
					// Emit only the lines that changed, not a whole-doc replace:
					// a full replace collapses the selection and unpins the
					// viewport, and restores with stale coords can't account
					// for the characters the link pass inserted before the
					// caret. A minimal diff lets CodeMirror map the caret by
					// the inserted delta and hold the scroll position natively.
					editor.transaction({ changes: minimalChanges(oldDoc, content) });
					return;
				}
				// Fallback: setValue resets cursor + scroll to the top, so
				// restore both after the layout settles.
				const scroll = editor.getScrollInfo?.();
				const cursor = editor.getCursor?.('head');
				editor.setValue(content);
				window.requestAnimationFrame(() => {
					if (scroll && editor.scrollTo) editor.scrollTo(scroll.top, scroll.left);
					if (cursor && editor.setCursor) editor.setCursor(cursor);
				});
			},
			notice: (msg) => {
				if (!readSettings().disableNotices) new Notice(msg);
			},
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
			ensureVaultCache: (opts) => this.ensureVaultCache(opts),
			vaultContextSuggestions: (source, doc, opts) =>
				this.vaultContextSuggestionsFor(source, doc, opts),
			preview: (suggestions, onApply, secondary) => {
				new PreviewSuggestModal(app, suggestions, onApply, readSettings().debug, secondary).open();
			},
		};
	}

	async onload() {
		await this.loadSettings();
		await this.loadVaultCache();

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

		// Debounced link-existing-notes on edit: waits for a typing pause
		// before running, so linking happens while the user is still working
		// rather than only on explicit save.
		this.registerEvent(
			this.app.workspace.on('editor-change', (_editor, info) => {
				const file = info.file;
				if (
					!this.settings.linkOnEditEnabled ||
					!this.settings.enableExistingLinks ||
					!(file instanceof TFile)
				)
					return;
				const filePath = file.path;
				window.clearTimeout(this.linkTimers[filePath]);
				this.linkTimers[filePath] = window.setTimeout(() => {
					delete this.linkTimers[filePath];
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (view && view.file?.path === filePath)
						linkExistingNotes(this.facade(view.editor, filePath));
				}, this.settings.linkOnEditTimeout * 1000);
			}),
		);

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

		// Temp debug command: exercise the open-for-undo path. Appends a marker
		// line to the active note inside a background tab (same undoableWriter
		// the preview flows use); Ctrl-Z in that tab should strip the marker.
		this.addCommand({
			id: 'debug-open-for-undo',
			name: 'Debug: append line in background tab for undo',
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				const path = ctx.file?.path ?? '';
				if (!path || !(ctx.file instanceof TFile)) {
					if (!this.settings.disableNotices)
						new Notice('Auto link creator: open a Markdown note first');
					return;
				}
				const writer = this.facade(editor, path).undoableWriter();
				if (!writer) {
					if (!this.settings.disableNotices)
						new Notice('Auto link creator: enable "open files for undo" in settings');
					return;
				}
				await writer(path, `${editor.getValue()}\n<!-- alcm-undo-test -->`);
				if (!this.settings.disableNotices)
					new Notice('Opened background tab; press ctrl-z there to remove the marker');
			},
		});

		// Status bar trigger for the current-file preview (not available on mobile).
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Auto link preview');
		statusBarItemEl.addClass('auto-link-statusbar');
		this.registerDomEvent(statusBarItemEl, 'click', () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				if (!this.settings.disableNotices)
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
		for (const id of Object.values(this.linkTimers)) window.clearTimeout(id);
		this.linkTimers = {};
		if (this.cacheSaveTimer !== undefined) {
			window.clearTimeout(this.cacheSaveTimer);
			this.cacheSaveTimer = undefined;
			void this.saveVaultCache();
		}
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
