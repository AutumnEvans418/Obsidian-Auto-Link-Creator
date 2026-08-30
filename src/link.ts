import type { ParsedTemplate } from './template.ts';
import { titleCase } from './nlp.ts';
import { isTableRow } from './linkDetector.ts';

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
export function applyLinks(doc: string, hits: ParsedTemplate[], capitalize: boolean): string {
	const lines = doc.split('\n');
	for (const hit of hits) {
		const line = lines[hit.lineIndex];
		if (line === undefined) continue;
		const prefix = /^\s*[-*]\s*/.exec(line)?.[0]?.length ?? 0;
		// Target the folded note when present; otherwise self-link. The
		// displayed text keeps the original surface word, so the visible line
		// is unchanged apart from the [[ ]] wrapper.
		// Link only the name, leaving an alias template's `(alias)` as plain
		// text after it — like Obsidian's own alias display. A folded variant
		// keeps its surface word via an alias so the visible text is unchanged.
		const target = hit.target ?? hit.name;
		const link =
			target === hit.name
				? wikiLink({ name: hit.name }, capitalize)
				: wikiLink({ name: target, alias: hit.name }, capitalize);
		// A `Name|Alias` link inside a table cell must escape its pipe so the
		// row keeps its cell structure.
		const linked = isTableRow(line) ? link.replace(/\|/g, '\\|') : link;
		const nameStart = hit.nameStart ?? prefix;
		lines[hit.lineIndex] = line.slice(0, nameStart) + linked + line.slice(nameStart + hit.name.length);
	}
	return lines.join('\n');
}
