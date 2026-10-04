export interface Span {
	start: number;
	end: number;
}

/** True when `line` is a markdown table row (cell separators are `|`). */
export function isTableRow(line: string): boolean {
	return /^\s*\|.*\|/.test(line);
}

/** All `[[...]]` spans in `text`; `end` is just past `]]`. */
export function wikiSpans(text: string): Span[] {
	const out: Span[] = [];
	for (const m of text.matchAll(/\[\[.*?\]\]/g)) {
		const start = m.index ?? 0;
		out.push({ start, end: start + m[0].length });
	}
	return out;
}

/** All `http(s)://` URL spans in `text`; trailing punctuation is not included. */
export function urlSpans(text: string): Span[] {
	const out: Span[] = [];
	for (const m of text.matchAll(/https?:\/\/\S+/gi)) {
		const start = m.index ?? 0;
		const end = start + (m[0] ?? '').replace(/[.,;:!?)\]}>'"`]+$/, '').length;
		out.push({ start, end });
	}
	return out;
}

/**
 * True when the char range [start,end) overlaps any `[[...]]` span in `text`.
 * Used to skip phrases that already live inside a wiki link so a second
 * pipeline run is a no-op (idempotency).
 */
export function overlapsExistingLink(text: string, start: number, end: number): boolean {
	for (const s of wikiSpans(text)) {
		if (start < s.end && end > s.start) return true;
	}
	return false;
}
