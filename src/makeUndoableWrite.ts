import type { App, MarkdownView } from 'obsidian';
import type { IPlugin } from './services/ipluginInterface';

/**
 * Build an `onWrite` that opens each appended-to file in a non-focusing leaf
 * and replaces its content through the editor, so Obsidian records a native
 * Ctrl-Z undo step for the change.
 */
export function makeUndoableWrite(app: App, plugin: IPlugin): (path: string, content: string) => Promise<void> {
	const views = new Map<string, MarkdownView>();
	return async (path: string, content: string) => {
		let view = plugin.getFile(path);
		if (!view) {
			const file = plugin.getFileByPath(path);
			if (!file) return;
			const leaf = app.workspace.getLeaf(false);
			view = await plugin.openFile(file, { active: false });
		}
		view.set(content);
	};
}
