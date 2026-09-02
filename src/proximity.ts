/**
 * Occurrence-proximity weighting: rank repeated-phrase suggestions by how
 * closely their occurrences cluster in a document. Phrases that appear
 * together (short span for their count) rank above ones scattered evenly.
 * Ranking only — never changes what is created or linked.
 */

/** Ascending line indices (0-based) where any form of the phrase appears. */
export function occurrenceLines(doc: string, forms: string[], ignoreCase = true): number[] {
	const hay = ignoreCase ? doc.toLowerCase() : doc;
	const needles = forms.map((f) => (ignoreCase ? f.toLowerCase() : f)).filter((f) => f.length > 0);
	const lines: number[] = [];
	hay.split('\n').forEach((line, i) => {
		if (needles.some((n) => line.includes(n))) lines.push(i);
	});
	return lines;
}

/**
 * Cluster score for a set of occurrence lines. Higher when the occurrences
 * are near one another: count divided by the span they cover (lines between
 * first and last, plus one). Fewer than two occurrences score 0 (no cluster
 * signal). All occurrences on one line score the full count.
 */
export function proximityScore(lines: number[]): number {
	if (lines.length < 2) return 0;
	let min = lines[0]!;
	let max = lines[0]!;
	for (const l of lines) {
		if (l < min) min = l;
		if (l > max) max = l;
	}
	return lines.length / (max - min + 1);
}

/**
 * Stable-sort `items` by proximity score (descending), then phrase count
 * (descending). `lines` supplies each item's occurrence lines. Ranking only:
 * the returned array is a reordering, never a filter.
 */
export function rankByProximity<T extends { name: string; count?: number }>(
	items: T[],
	lines: (item: T) => number[],
): T[] {
	return [...items]
		.map((item, i) => ({ item, score: proximityScore(lines(item)), i }))
		.sort((a, b) =>
			b.score - a.score || (b.item.count ?? 0) - (a.item.count ?? 0) || a.i - b.i,
		)
		.map((x) => x.item);
}
