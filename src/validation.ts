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
}

/**
 * Build a per-line predicate for fenced code blocks (```) shared by the
 * template and existing-link scanners, so both honor the same allowlist.
 * Returns true when `line` is a fence boundary, or the body of a block kept
 * out by `ignoreCodeblocks`/`allowedCodeblocks`.
 */
export function makeCodeblockFilter(
	opts: CodeblockFilterOptions = {},
): (line: string) => boolean {
	const ignore = opts.ignoreCodeblocks ?? true;
	const allow = new Set(
		(opts.allowedCodeblocks ?? []).map((l) => l.trim().toLowerCase()).filter(Boolean),
	);
	let inBody = false;
	let skipBody = false;
	return (line) => {
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
