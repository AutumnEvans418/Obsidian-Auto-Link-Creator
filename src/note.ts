export interface NoteFields {
	name: string;
	alias?: string;
	/** Additional aliases (e.g. variant forms of the name). */
	aliases?: string[];
	content?: string;
}

const frontmatter = (aliases: string[]) =>
	aliases.length
		? `---\naliases:\n${aliases.map((a) => `  - ${a}`).join('\n')}\n---\n`
		: '';

/**
 * Body for a generated target note. Frontmatter with aliases only when at
 * least one is present; the parsed line content fills the body.
 */
export function noteBody({ alias, aliases, content }: NoteFields): string {
	const all = [...(alias ? [alias] : []), ...(aliases ?? [])];
	const unique = [...new Set(all)];
	const body = `${frontmatter(unique)}${content ?? ''}`.trimEnd();
	return body ? `${body}\n` : '';
}
