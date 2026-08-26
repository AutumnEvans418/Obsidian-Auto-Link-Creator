/**
 * Resolve where a new note should live given the files that reference it.
 * Returns the closest (deepest) common folder of the referencing files;
 * '' when only the vault root is shared (no common folder).
 */
export function closestCommonFolder(paths: string[]): string {
	const dirs = paths
		.map((p) => p.split('/').slice(0, -1))
		.filter((d) => d.length > 0);
	if (!dirs.length) return '';
	let common = dirs[0] as string[];
	for (const d of dirs) {
		let i = 0;
		while (i < common.length && d[i] === common[i]) i++;
		common = common.slice(0, i);
		if (!common.length) break;
	}
	return common.join('/');
}

export type NewFolderMode = 'subfolder' | 'closest';

/**
 * Resolve the folder new notes go into. Blank `name` keeps `base` (the
 * source note's own folder). 'subfolder' yields `<base>/<name>`; 'closest'
 * walks up from `base` to the nearest existing `<ancestor>/<name>` folder
 * and returns null when none exists (caller prompts for a location).
 */
export function resolveTargetFolder(
	base: string,
	name: string,
	mode: NewFolderMode,
	exists: (path: string) => boolean,
): string | null {
	const clean = name.trim().replace(/^\/+|\/+$/g, '');
	if (!clean) return base;
	if (mode === 'subfolder') return base ? `${base}/${clean}` : clean;
	const parts = base ? base.split('/') : [];
	for (let i = parts.length; i >= 0; i--) {
		const candidate = [...parts.slice(0, i), clean].join('/');
		if (exists(candidate)) return candidate;
	}
	return null;
}
