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
