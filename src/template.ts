export interface ParsedTemplate {
	name: string;
	alias?: string;
	content?: string;
	lineIndex: number;
}

type Field = 'name' | 'alias' | 'content';

const FIELD_KEY = /\{\{\s*link\s+(name|alias|content)\s*\}\}/gi;

/** Field order as they appear in a template string. */
function fieldsOf(tpl: string): Field[] {
	const out: Field[] = [];
	tpl.replace(FIELD_KEY, (_m, key: string) => {
		out.push(key.toLowerCase() as Field);
		return '';
	});
	return out;
}

/**
 * Build the header-line regex. Name line (bullet + name) is fixed; alias and
 * content are optional and matched on the same line. Content carries its own
 * separator so a line without parens/alias still parses.
 */
function headerRegexp(fields: Field[]): RegExp {
	let src = '^\\s*[-*]\\s*(.+?';
	if (fields.includes('alias')) {
		src += ')(?:\\s*\\(([^()]*?)\\))?';
	} else {
		src += ')';
	}
	if (fields.includes('content')) {
		src += '(?:\\s*[-:–]\\s*(.+))?';
	}
	return new RegExp(src + '$', 'i');
}

/** True when the template's `{{Link Content}}` sits on its own child line. */
function contentIsChild(tpl: string): boolean {
	const pos = tpl.lastIndexOf('{{Link Content}}');
	return pos >= 0 && tpl.slice(0, pos).includes('\n');
}

export interface CompiledTemplate {
	fields: Field[];
	header: RegExp;
	hasContent: boolean;
	contentIsChild: boolean;
}

export function compileTemplate(tpl: string): CompiledTemplate | null {
	const fields = fieldsOf(tpl);
	if (!fields.includes('name')) return null;
	return {
		fields,
		header: headerRegexp(fields),
		hasContent: fields.includes('content'),
		contentIsChild: contentIsChild(tpl),
	};
}

/**
 * Match a text block against a template; returns the first hit. Child-line
 * content (indented `- item` below the header) is joined into `content`.
 */
/**
 * Match a text block against a template, returning every hit (in document
 * order). Unlike `matchTemplate` (first win), this pairs the same line matcher
 * with child-content gathering at each matching line.
 */
export function findAllTemplate(text: string, tpl: string): ParsedTemplate[] {
	const c = compileTemplate(tpl);
	if (!c) return [];
	const out: ParsedTemplate[] = [];
	const lines = text.split('\n');
	let skipUntil = 0;
	for (let i = 0; i < lines.length; i++) {
		if (i < skipUntil) continue;
		const hit = parseAt(c, lines, i);
		if (hit) {
			out.push(hit);
			if (c.contentIsChild && hit.content) {
				skipUntil = i + 1 + hit.content.split('\n').length;
			}
		}
	}
	return out;
}

export function matchTemplate(text: string, tpl: string): ParsedTemplate | null {
	const c = compileTemplate(tpl);
	if (!c) return null;
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const hit = parseAt(c, lines, i);
		if (hit) return hit;
	}
	return null;
}

function parseAt(c: CompiledTemplate, lines: string[], i: number): ParsedTemplate | null {
	const line = lines[i];
	if (line === undefined) return null;
	const m = c.header.exec(line);
	if (!m) return null;
	const nameCaptured = m[1];
	if (!nameCaptured) return null;
	const name = nameCaptured.trim();
	const out: ParsedTemplate = { name, lineIndex: i };
	const aliasCaptured = m[2];
	if (aliasCaptured) out.alias = aliasCaptured.trim();
	if (c.hasContent && c.contentIsChild) {
		const thisIndent = (line.match(/^\s*/)?.[0] ?? '').length;
		const children: string[] = [];
		for (let j = i + 1; j < lines.length; j++) {
			const child = lines[j];
			if (child === undefined) break;
			const cm = /^\s*[-*]\s+(.*)$/.exec(child);
			if (!cm) break;
			const childIndent = child.match(/^\s*/)?.[0]?.length ?? 0;
			if (childIndent <= thisIndent) break;
			const v = cm[1];
			if (v && v.trim()) children.push(v.trim());
		}
		if (children.length) out.content = children.join('\n');
	} else if (c.hasContent) {
		const ci = c.fields.indexOf('content');
		const captured = m[ci + 1];
		if (captured) out.content = captured.trim();
	}
	return out;
}
