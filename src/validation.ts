const NAME_FIELD = /\{\{\s*link name\s*\}\}/i;

/** A template is valid only if it contains a `{{Link Name}}` field. */
export function isValidTemplate(tpl: string): boolean {
	return NAME_FIELD.test(tpl);
}

/**
 * Index of the closing `---` of a leading YAML frontmatter block (lines
 * 0..end belong to it), or -1 when the document has none.
 */
export function frontmatterEnd(lines: string[]): number {
	if (lines[0]?.trim() !== '---') return -1;
	return lines.findIndex((l, i) => i > 0 && l.trim() === '---');
}

/**
 * True for numeric/date-like phrases: "2026", "2026-08-24",
 * "2026-08-24T23:47:33-05:00". Only digits plus separators/T/Z allowed.
 */
export function isDateLike(name: string): boolean {
	return /\d/.test(name) && !/[^\d\s\-/:.,+TZtz]/.test(name);
}

export interface CodeblockFilterOptions {
	/** Skip contents of non-allowed fenced blocks. Default true. */
	ignoreCodeblocks?: boolean;
	/** Fenced-block languages (e.g. `mermaid`) to still link inside. */
	allowedCodeblocks?: string[];
	/** Skip lines that begin an HTML tag/comment (`<div>`, `<!-- …`). */
	ignoreHtml?: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when the leading YAML frontmatter block sets `key` to a falsy value
 * (`false`, `no`, `off`, `0`). Used to disable auto-linking per note.
 */
export function frontmatterDisabled(doc: string, key = 'auto-link'): boolean {
	const lines = doc.split('\n');
	const end = frontmatterEnd(lines);
	if (end === -1) return false;
	const block = lines.slice(1, end).join('\n');
	return new RegExp(`^\\s*${escapeRe(key)}\\s*:\\s*(?:false|no|off|0)\\s*$`, 'im').test(block);
}

/**
 * Build a per-line predicate for code and HTML blocks shared by the template
 * and existing-link scanners, so both honor the same allowlist. Returns true
 * when `line` is a fence boundary, the body of a block kept out by
 * `ignoreCodeblocks`/`allowedCodeblocks`, or (with `ignoreHtml`) an HTML line
 * that begins with `<`.
 */
export function makeCodeblockFilter(
	opts: CodeblockFilterOptions = {},
): (line: string) => boolean {
	const ignore = opts.ignoreCodeblocks ?? true;
	const ignoreHtml = opts.ignoreHtml ?? false;
	const allow = new Set(
		(opts.allowedCodeblocks ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean),
	);
	let inBody = false;
	let skipBody = false;
	return (line) => {
		if (/^\s*</.test(line)) return ignoreHtml;
		if (!/^```/.test(line)) return inBody && skipBody;
		const lang = /^```\s*(\S+)/.exec(line)?.[1]?.toLowerCase() ?? '';
		if (!inBody) {
			inBody = true;
			skipBody = ignore && !allow.has(lang);
		} else {
			inBody = false;
		}
		return true;
	};
}
