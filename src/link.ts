import type { ParsedTemplate } from './template';

type LinkFields = Pick<ParsedTemplate, 'name' | 'alias'>;

/** `[[Name|Alias]]`, or `[[Name]]` when there's no alias. */
export function wikiLink({ name, alias }: LinkFields): string {
	return alias ? `[[${name}|${alias}]]` : `[[${name}]]`;
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
export function markdownLink({ name, alias }: LinkFields, targetPath: string): string {
	const text = alias ?? name;
	return `[${text}](${encodePath(targetPath)})`;
}
