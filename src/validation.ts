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
