import type { ParsedTemplate } from './template.ts';
import { titleCase } from './nlp.ts';
import { isTableRow, wikiSpans } from './linkDetector.ts';

type LinkFields = Pick<ParsedTemplate, 'name' | 'alias'>;

/** `[[Name|Alias]]`, or `[[Name]]` when there's no alias. */
export function wikiLink({ name, alias }: LinkFields, capitalize = true): string {
	if (capitalize) {
		name = titleCase(name);
		alias = alias ? titleCase(alias) : '';
	}
	return alias && alias !== name ? `[[${name}|${alias}]]` : `[[${name}]]`;
}

/**
 * URL-encode a vault path for a markdown link target, preserving folder
 * separators: `Projects/Three laws.md` → `Projects/Three%20laws.md`.
 */
export function encodePath(path: string): string {
	return path
		.split('/')
		.map((seg) => encodeURIComponent(seg))
		.join('/');
}

/** Markdown-relative `[text](path.md)`; text is the alias if present. */
export function markdownLink(
	{ name, alias }: LinkFields,
	targetPath: string,
	capitalize = true,
): string {
	if (capitalize) {
		name = titleCase(name);
		alias = alias ? titleCase(alias) : '';
	}
	return `[${alias || name}](${encodePath(targetPath)})`;
}

/**
 * Rewrite a doc, wrapping each matched line's link name in a wiki link while
 * leaving everything else — content and formatting — untouched. The line
 * `- Armor Class (AC) - The damage threshold` becomes
 * `- [[Armor Class|Armor Class (AC)]] - The damage threshold` (the resolved
 * note as target, the original word as displayed text).
 */
/**
 * Remove the `[[ ]]` brackets of every wiki link that overlaps
 * `[start, end)` so a longer definition can swallow a shorter already-linked
 * span. Returns the healed line and the name's shifted start index.
 */
function stripOverlappingLinks(
	line: string,
	start: number,
	end: number,
): { line: string; start: number } {
	const spans = wikiSpans(line).filter((s) => start < s.end && end > s.start);
	if (!spans.length) return { line, start };
	let out = '';
	let cursor = 0;
	let startShift = 0;
	for (const s of spans) {
		out += line.slice(cursor, s.start);
		out += line.slice(s.start + 2, s.end - 2);
		if (s.start < start) startShift += 2;
		cursor = s.end;
	}
	out += line.slice(cursor);
	return { line: out, start: start - startShift };
}

export function applyLinks(doc: string, hits: ParsedTemplate[], capitalize: boolean): string {
	const lines = doc.split('\n');
	for (const hit of hits) {
		let line = lines[hit.lineIndex];
		if (line === undefined) continue;
		const prefix = /^\s*[-*]\s*/.exec(line)?.[0]?.length ?? 0;
		const target = hit.target ?? hit.name;
		const link =
			target === hit.name
				? wikiLink({ name: hit.name }, capitalize)
				: wikiLink({ name: target, alias: hit.name }, capitalize);
		// A `Name|Alias` link inside a table cell must escape its pipe so the
		// row keeps its cell structure.
		const linked = isTableRow(line) ? link.replace(/\|/g, '\\|') : link;
		let nameStart = hit.nameStart ?? prefix;
		if (hit.nameStart !== undefined) {
			const healed = stripOverlappingLinks(line, nameStart, nameStart + hit.name.length);
			line = healed.line;
			nameStart = healed.start;
		}
		lines[hit.lineIndex] = line.slice(0, nameStart) + linked + line.slice(nameStart + hit.name.length);
	}
	return lines.join('\n');
}
