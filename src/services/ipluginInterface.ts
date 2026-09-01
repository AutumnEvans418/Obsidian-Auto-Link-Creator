import type { OpenViewState, TFile } from "obsidian";
import type { NlpOptions } from "../keywords.ts";
import type { AutoLinkSettings } from "../settingsSchema.ts";
import type { Suggestion } from "../ui/suggestion.ts";

/** Minimal editor surface (Obsidian's Editor satisfies this). */
export interface IEditorView {
	getValue(): string;
	setValue(content: string): void;
	/** Obsidian Editor only; absent in test fakes. Enables viewport-safe writes. */
	transaction?(tx: {
		changes?: {
			from: { line: number; ch: number };
			to?: { line: number; ch: number };
			text: string | string[];
		}[];
	}): void;
	/** Obsidian Editor only; used to restore the viewport after a write. */
	getScrollInfo?(): { top: number; left: number };
	scrollTo?(top: number, left?: number): void;
	getCursor?(from?: 'from' | 'to' | 'head'): { line: number; ch: number };
	setCursor?(pos: { line: number; ch: number }): void;
}

/**
 * Obsidian-free facade over the App/workspace APIs the command services use.
 * `main.ts` supplies the real implementation; unit tests supply fakes.
 * Only `import type` may appear here so services stay runnable under
 * `node --test`.
 */
export interface IPlugin {
	/** Active editor document text ('' when no editor is attached). */
	value(): string;
	set(content: string): void;
	notice(msg: string): void;
	readonly settings: AutoLinkSettings;
	/** Path of the active file; '' when none. */
	source(): string;
	/** Folder of the active file; '' = vault root. */
	folder(): string;

	// --- vault ---
	markdownFiles(): { path: string; basename: string }[];
	/** Raw paths under `folder` (includes files not yet indexed). */
	getFiles(folder: string): Promise<string[]>;
	getFileByPath(path: string): TFile | null;
	/** Aliases of a note from the metadata cache's frontmatter index. */
	noteAliases(path: string): string[];
	/** Unique link targets from wikilinks whose notes do not exist yet. */
	unresolvedLinks(): string[];
	read(fileOrPath: TFile | string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	modify(file: TFile, data: string): Promise<void>;
	create(path: string, data: string): Promise<TFile>;

	// --- folder placement ---
	/** True when a folder exists at `path` (vault root '' always exists). */
	folderExists?(path: string): boolean;
	/**
	 * Ask the user where to create notes; resolves the chosen path or null
	 * on cancel. Optional: absent in tests, which fall back to a subfolder.
	 */
	promptFolder?(defaultPath: string): Promise<string | null>;

	// --- workspace ---
	openFile(file: TFile, state?: OpenViewState): Promise<IEditorView>;
	/**
	 * onWrite hook that routes writes through a non-focusing open editor so
	 * Obsidian records native undo steps; undefined when disabled.
	 */
	undoableWriter():
		| ((path: string, content: string) => Promise<void>)
		| undefined;

	// --- vault-context NLP cache ---
	/**
	 * Reconcile the plugin's per-file n-gram cache with the vault: recount any
	 * file whose mtime changed (or that's new under these opts), prune entries
	 * for deleted files, and persist the cache. Unchanged files are a cheap
	 * mtime compare — no read, no re-tokenizing.
	 */
	ensureVaultCache(opts: NlpOptions): Promise<void>;
	/**
	 * Vault-context suggestions for the active note from the already-reconciled
	 * cache. Cheap and synchronous (no vault IO). Returns [] before
	 * {@link ensureVaultCache} has run.
	 */
	vaultContextSuggestions(currentSource: string, currentDoc: string, opts: NlpOptions): Suggestion[];

	/**
	 * Show the preview modal; onApply receives selected suggestion indices
	 * into the shown list (plus `listIndex`, 0 = primary, 1 = secondary).
	 * `secondary` adds an optional alternate list (e.g. vault-context NLP)
	 * the modal can toggle between; omit to show only `suggestions`.
	 */
	preview(
		suggestions: Suggestion[],
		onApply: (indices: number[], listIndex?: number) => Promise<void>,
		secondary?: { label: string; load: () => Promise<Suggestion[]> },
	): void;
}
