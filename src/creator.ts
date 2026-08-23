import { TFile, Vault } from 'obsidian';
import { NoteFields, noteBody } from './note';

function targetPath(folder: string, name: string): string {
	return folder ? `${folder}/${name}.md` : `${name}.md`;
}

/**
 * Create `Name.md` under `folder`. If it already exists, append `content` to
 * the bottom instead of overwriting. Returns the path and whether a new note
 * was created.
 */
export async function createNote(
	vault: Vault,
	folder: string,
	f: NoteFields,
): Promise<{ path: string; created: boolean }> {
	const path = targetPath(folder, f.name);
	const existing = vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		if (f.content) {
			const cur = await vault.read(existing);
			const merged = cur.trimEnd();
			await vault.modify(existing, merged ? `${merged}\n\n${f.content}` : f.content);
		}
		return { path, created: false };
	}
	await vault.create(path, noteBody(f));
	return { path, created: true };
}
