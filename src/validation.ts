const NAME_FIELD = /\{\{\s*link name\s*\}\}/i;

/** A template is valid only if it contains a `{{Link Name}}` field. */
export function isValidTemplate(tpl: string): boolean {
	return NAME_FIELD.test(tpl);
}
