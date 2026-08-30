import { mergeAliasesIntoDoc, mergeContent, noteBody } from './note.ts';
import type { NoteFields } from './note.ts';
import { titleCase } from './nlp.ts';
import type { IPlugin } from './services/ipluginInterface.ts';

/** Case-insensitive name (lowercased, extension stripped). */
const bare = (p: string) => p.split('/').pop()?.replace(/\.md$/i, '') ?? '';


/**
 * Resolve a real file path in `folder` whose name matches `name` regardless of
 * case (for detecting orphaned files Obsidian hasn't indexed). Returns null
 * when none exists on disk.
 */
async function findOrphan(
	adapter: IPlugin,
	folder: string,
	name: string,
): Promise<string | null> {
	let entries;
	try {
		entries = await adapter.getFiles(folder);
	} catch {
		return null;
	}
	const want = name.toLowerCase();
	for (const f of entries) {
		if (f.includes('/') && !f.toLowerCase().startsWith(`${folder}/`.toLowerCase()))
			continue;
		if (bare(f).toLowerCase() === want) return f;
	}
	return null;
}

/**
 * Create `Name.md` under `folder`, or append to it if it already exists.
 * Writes go through Obsidian's vault API so the metadata index stays in sync
 * (direct adapter writes cause ghost duplicates in the file explorer).
 */
export async function createNote(
	vault: IPlugin,
	folder: string,
	f: NoteFields,
	capitalize = true,
	onWrite?: (path: string, content: string) => Promise<void>,
): Promise<{ path: string; created: boolean }> {
	f = { ...f, name: capitalize ? titleCase(f.name) : f.name };
	const canonical = folder ? `${folder}/${f.name}.md` : `${f.name}.md`;

	const appendPath = async (path: string): Promise<{ path: string; created: boolean }> => {
		if (f.content || f.aliases?.length || f.alias) {
			const indexed = vault.getFileByPath(path);
			let cur = indexed ? await vault.read(indexed) : await vault.read(path);
			const withAliases = mergeAliasesIntoDoc(cur, [f.alias, ...(f.aliases ?? [])].filter((a): a is string => !!a));
			if (withAliases !== cur) cur = withAliases;
			const merged = mergeContent(cur, f.content ?? '');
			if (onWrite) await onWrite(path, merged);
			else if (indexed) await vault.modify(indexed, merged);
			else await vault.write(path, merged);
		}
		return { path, created: false };
	};

	// Indexed? Prefer the canonical path (normal Obsidian case).
	const indexed = vault.getFileByPath(canonical);
	if (indexed) return appendPath(canonical);

	// Index miss — create it so Obsidian registers the file (no ghost).
	try {
		await vault.create(canonical, noteBody(f));
		return { path: canonical, created: true };
	} catch {
		// An orphaned file on disk (different case, or not yet indexed).
		const orphan = await findOrphan(vault, folder, f.name);
		if (orphan) return appendPath(orphan);
		throw new Error(`create ${canonical} failed`);
	}
}

/** Append `content` unless the identical block is already the last block. */
// mergeContent lives in note.ts (obsidian-free, unit-tested).
