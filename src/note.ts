export interface NoteFields {
	name: string;
	alias?: string;
	content?: string;
}

const frontmatter = (alias?: string) =>
	alias ? `---\naliases: [${alias}]\n---\n` : '';

/**
 * Body for a generated target note. Frontmatter (with alias) only when an
 * alias is present; the parsed line content fills the body.
 */
export function noteBody({ alias, content }: NoteFields): string {
	const body = `${frontmatter(alias)}${content ?? ''}`.trimEnd();
	return body ? `${body}\n` : '';
}
