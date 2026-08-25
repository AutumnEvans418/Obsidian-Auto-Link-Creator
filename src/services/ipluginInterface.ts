import type { OpenViewState, TFile } from "obsidian";
import type { AutoLinkSettings } from "../settingsSchema.ts";
import type { Suggestion } from "../ui/suggestion.ts";

/** Minimal editor surface (Obsidian's Editor satisfies this). */
export interface IEditorView {
	getValue(): string;
	setValue(content: string): void;
	/** Obsidian Editor only; absent in test fakes. Enables viewport-safe writes. */
	offsetToPos?(offset: number): { line: number; ch: number };
	transaction?(tx: {
		changes?: {
			from: { line: number; ch: number };
			to?: { line: number; ch: number };
			text: string | string[];
		}[];
	}): void;
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
	read(fileOrPath: TFile | string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	modify(file: TFile, data: string): Promise<void>;
	create(path: string, data: string): Promise<TFile>;

	// --- workspace ---
	openFile(file: TFile, state?: OpenViewState): Promise<IEditorView>;
	/**
	 * onWrite hook that routes writes through a non-focusing open editor so
	 * Obsidian records native undo steps; undefined when disabled.
	 */
	undoableWriter():
		| ((path: string, content: string) => Promise<void>)
		| undefined;
	/** Show the preview modal; onApply receives selected suggestion indices. */
	preview(
		suggestions: Suggestion[],
		onApply: (indices: number[]) => Promise<void>,
	): void;
}
