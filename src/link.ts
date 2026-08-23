import { groupByReference, type ParsedTemplate } from './template.ts';
import { titleCase } from './nlp.ts';

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
 * Rewrite a doc, replacing the matched template blocks (bottom-up) with
 * `- [[Name|Alias]]` link lines. Multi-line child content collapses into one.
 * Variants of the same reference merge into a single link: the lead line stays
 * (as the link), the other variant lines are removed (they live on as aliases
 * in the created note's frontmatter).
 */
export function applyLinks(doc: string, hits: ParsedTemplate[], capitalize: boolean): string {
	type Op = { lineIndex: number; link: string | null; deleteCount: number };
	const ops: Op[] = [];
	for (const group of groupByReference(hits)) {
		const sorted = [...group].sort((a, b) => a.lineIndex - b.lineIndex);
		sorted.forEach((hit, k) => {
			const extra = hit.content ? hit.content.split('\n').length : 0;
			if (k === 0) {
				ops.push({ lineIndex: hit.lineIndex, link: wikiLink(hit, capitalize), deleteCount: extra + 1 });
			} else {
				ops.push({ lineIndex: hit.lineIndex, link: null, deleteCount: extra + 1 });
			}
		});
	}
	ops.sort((a, b) => b.lineIndex - a.lineIndex);
	const out = doc.split('\n');
	for (const op of ops) {
		out.splice(op.lineIndex, op.deleteCount, ...(op.link ? [`- ${op.link}`] : []));
	}
	return out.join('\n');
}
