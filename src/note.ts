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

/**
 * Add missing aliases to an existing note's frontmatter. No-op when the note
 * has no YAML frontmatter (or no `aliases` list) or every alias is present.
 */
export function mergeAliasesIntoDoc(cur: string, newAliases: string[]): string {
	const keep = [...new Set(newAliases)].filter(Boolean);
	if (!keep.length) return cur;
	const fm = /^---\n([\s\S]*?)\n---\n?/.exec(cur);
	if (!fm) return cur;
	const lines = (fm[1] ?? '').split('\n') as string[];
	const idx = lines.findIndex((l) => /^aliases:\s*$/i.test(l.trim()));
	if (idx === -1) return cur;
	const existing = new Set<string>();
	let lastAliasIdx = idx;
	for (let j = idx + 1; j < lines.length; j++) {
		const line = lines[j];
		if (line === undefined) break;
		const v = /^\s*-\s*(.+)$/.exec(line);
		if (!v) break;
		existing.add(v[1]!.trim());
		lastAliasIdx = j;
	}
	const add = keep.filter((a) => !existing.has(a));
	if (!add.length) return cur;
	const next = [...lines.slice(0, lastAliasIdx + 1), ...add.map((a) => `  - ${a}`), ...lines.slice(lastAliasIdx + 1)];
	return `---\n${next.join('\n')}\n---\n${cur.slice(fm[0].length)}`;
}

/** Append `content` to a note unless the identical block is already last. */
export function mergeContent(cur: string, content: string): string {
	if (!content) return cur;
	const trimmed = cur.trimEnd();
	if (!trimmed) return content;
	if (trimmed === content || trimmed.endsWith(content)) return cur;
	return `${trimmed}\n\n${content}`;
}
