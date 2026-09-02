import type { AutoLinkSettings, ScopeMode } from "./settingsSchema.ts";
import { frontmatterEnd } from "./validation.ts";

/** Folder containing `path` ('' for vault-root files). */
export function dirOf(path: string): string {
	const i = path.lastIndexOf('/');
	return i < 0 ? '' : path.slice(0, i);
}

/** Normalize a scope folder path (trim slashes); '' when blank. */
function normalize(folder: string): string {
	return folder.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * Whether a markdown file at `path` falls inside the configured namespace
 * scope. `sourceFolder` is the active note's folder, only consulted for the
 * 'same' (same-folder-only) scope. 'vault' always returns true.
 */
export function inScope(
	path: string,
	s: Pick<AutoLinkSettings, 'scope' | 'scopeFolder'>,
	sourceFolder?: string,
): boolean {
	const dir = dirOf(path);
	if (s.scope === 'vault') return true;
	if (s.scope === 'same') return !!sourceFolder && dir === sourceFolder;
	const root = normalize(s.scopeFolder);
	if (!root) return true;
	return dir === root || dir.startsWith(root + '/');
}

/** The folder new notes should be created in per the scope ('' = default). */
export function scopeFolderFor(
	s: Pick<AutoLinkSettings, 'scope' | 'scopeFolder'>,
	sourceFolder?: string,
): string {
	if (s.scope === 'folder') return normalize(s.scopeFolder);
	if (s.scope === 'same') return sourceFolder ?? '';
	return '';
}

/** Frontmatter key holding a note's own namespace folder. */
export const NAMESPACE_KEY = 'namespace';

/**
 * The folder a note claims as its namespace in frontmatter
 * (`namespace: team-a`), or '' when unset. The value is normalized and
 * unquoted; list/object values parse as ''.
 */
export function frontmatterNamespace(doc: string, key = NAMESPACE_KEY): string {
	const end = frontmatterEnd(doc.split('\n'));
	if (end === -1) return '';
	const line = doc
		.split('\n')
		.slice(1, end)
		.map((l) => l.trim())
		.find((l) => l.startsWith(`${key}:`));
	if (!line) return '';
	const value = line.slice(key.length + 1).trim();
	return normalize(value.replace(/^["']|["']$/g, ''));
}

/**
 * Effective scope for a note: its frontmatter namespace folder wins over the
 * global scope (behaving as a 'folder' scope rooted there); otherwise the
 * global scope applies unchanged.
 */
export function effectiveScope(
	s: Pick<AutoLinkSettings, 'scope' | 'scopeFolder'>,
	namespace: string,
): Pick<AutoLinkSettings, 'scope' | 'scopeFolder'> {
	const f = normalize(namespace);
	return f ? { scope: 'folder', scopeFolder: f } : s;
}

export type { ScopeMode };
