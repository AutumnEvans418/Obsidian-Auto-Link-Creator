import type { App, MarkdownView } from 'obsidian';

/**
 * Build an `onWrite` that opens each appended-to file in a non-focusing leaf
 * and replaces its content through the editor, so Obsidian records a native
 * Ctrl-Z undo step for the change.
 */
export function makeUndoableWrite(app: App): (path: string, content: string) => Promise<void> {
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
