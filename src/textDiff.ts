/** A change replacing `from`→`to` (old coords) with `text`. CM6-EditorChange shaped. */
export interface TextChange {
	from: { line: number; ch: number };
	to: { line: number; ch: number };
	text: string;
}

/**
 * Minimal line-level diff between two documents: only the runs of lines that
 * differ. Emitting a whole-document replace collapses CodeMirror's selection
 * to the end and unpins the viewport, so the editor loses cursor and scroll;
 * a small bounded change maps the caret by the inserted delta natively and
 * keeps the viewport anchored.
 */
export function minimalChanges(oldDoc: string, newDoc: string): TextChange[] {
	const a = oldDoc.split('\n');
	const b = newDoc.split('\n');
	const changes: TextChange[] = [];
	const len = Math.max(a.length, b.length);
	let i = 0;
	while (i < len) {
		if (a[i] === b[i]) {
			i++;
			continue;
		}
		let j = i;
		while (j < len && a[j] !== b[j]) j++;
		// Old line the replaced region ends on (clamped to last existing line).
		const oldLast = Math.min(j, a.length) - 1;
		changes.push({
			from: { line: i, ch: 0 },
			to: {
				line: oldLast,
				ch: (a[oldLast] ?? '').length,
			},
			text: b.slice(i, j).join('\n'),
		});
		i = j;
	}
	return changes;
}