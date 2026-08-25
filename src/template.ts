import { sameReference } from './nlp.ts';
import { overlapsExistingLink } from './linkDetector.ts';
import { frontmatterEnd, isDateLike } from './validation.ts';

export interface ParsedTemplate {
	name: string;
	alias?: string;
	content?: string;
	lineIndex: number;
	/** The template pattern that matched this line (set by the finders). */
	template?: string;
	/** Resolved note name when `name` is a foldable variant; set by applyers. */
	target?: string;
}

/**
 * Group hits whose names are the same reference under NLP forms (e.g.
 * "Risk Appetite" and "Risk Appetites"). First-seen name leads its group.
 */
/**
 * Combine a reference group's contents (document order, deduped) into one
 * block. Variants of the same note each contribute their content.
 */
export function groupContent(group: ParsedTemplate[]): string | undefined {
	const seen = new Set<string>();
	const parts: string[] = [];
	for (const h of group) {
		if (!h.content || seen.has(h.content)) continue;
		seen.add(h.content);
		parts.push(h.content);
	}
	return parts.length ? parts.join('\n\n') : undefined;
}

export function groupByReference(hits: ParsedTemplate[]): ParsedTemplate[][] {
	const groups: ParsedTemplate[][] = [];
	for (const h of hits) {
		const group = groups.find((g) => {
			const lead = g[0];
			return lead !== undefined && sameReference(lead.name, h.name);
		});
		if (group) group.push(h);
		else groups.push([h]);
	}
	return groups;
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
export interface TemplateOptions {
	/** Skip lines inside fenced code blocks (```). */
	ignoreCodeblocks?: boolean;
	/**
	 * Skip a phrase whose name region overlaps an existing `[[...]]` span, so
	 * re-running on already-linked output is a no-op. Default true.
	 */
	skipLinked?: boolean;
	/** Skip hits whose name is date/number-like (e.g. `2026-08-24`). */
	ignoreDates?: boolean;
}

/** True when a matched name should be dropped: junk (`--`) or date-like. */
function rejectedName(name: string, opts: TemplateOptions): boolean {
	const ignoreDates = opts.ignoreDates ?? true;
	// Punctuation-only junk ("--") is never a link name; numeric/date-like
	// names ("2026", "2026-08-24T…") follow the ignore-dates setting.
	if (!/\p{L}/u.test(name)) return !/\d/.test(name) || ignoreDates;
	return ignoreDates && isDateLike(name);
}

/** True when `line` is a ``` fence (opening or closing), optionally with a lang tag. */
function isFence(line: string): boolean {
	return /^```/.test(line);
}

/**
 * Match a text block against a template, returning every hit (in document
 * order). Unlike `matchTemplate` (first win), this pairs the same line matcher
 * with child-content gathering at each matching line.
 */
export function findAllTemplate(
	text: string,
	tpl: string,
	opts: TemplateOptions = {},
): ParsedTemplate[] {
	const c = compileTemplate(tpl);
	if (!c) return [];
	const out: ParsedTemplate[] = [];
	const lines = text.split('\n');
	const skipFence = opts.ignoreCodeblocks ?? true;
	const skipLinked = opts.skipLinked ?? true;
	const fmEnd = frontmatterEnd(lines);
	let skipUntil = 0;
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (skipFence) {
			if (isFence(line)) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;
		}
		if (i <= fmEnd || i < skipUntil) continue;
		const r = parseAt(c, lines, i, skipLinked);
		if (r) {
			if (rejectedName(r.hit.name, opts)) continue;
			out.push({ ...r.hit, template: tpl });
			if (r.childCount) skipUntil = i + 1 + r.childCount;
		}
	}
	return out;
}

/**
 * Single pass over `text`: for each line, the FIRST template (in `templates`
 * order) whose header matches wins; later templates never re-match that line.
 * Child-content lines consumed by a nested template are skipped.
 */
export function findAllByTemplates(
	text: string,
	templates: string[],
	opts: TemplateOptions = {},
): ParsedTemplate[] {
	const comps: CompiledTemplateWithSource[] = [];
	for (const tpl of templates) {
		const c = compileTemplate(tpl);
		if (!c) continue;
		comps.push({ ...c, template: tpl });
	}
	const lines = text.split('\n');
	const out: ParsedTemplate[] = [];
	const skipFence = opts.ignoreCodeblocks ?? true;
	const skipLinked = opts.skipLinked ?? true;
	const fmEnd = frontmatterEnd(lines);
	let skipUntil = 0;
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (skipFence) {
			if (isFence(line)) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;
		}
		if (i <= fmEnd || i < skipUntil) continue;
		for (const c of comps) {
			const r = parseAt(c, lines, i, skipLinked);
			if (!r) continue;
			if (rejectedName(r.hit.name, opts)) break;
			out.push({ ...r.hit, template: c.template });
			if (r.childCount) skipUntil = i + 1 + r.childCount;
			break;
		}
	}
	return out;
}

export function matchTemplate(
	text: string,
	tpl: string,
	opts: TemplateOptions = {},
): ParsedTemplate | null {
	const c = compileTemplate(tpl);
	if (!c) return null;
	const lines = text.split('\n');
	const skipFence = opts.ignoreCodeblocks ?? true;
	const skipLinked = opts.skipLinked ?? true;
	const fmEnd = frontmatterEnd(lines);
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (skipFence) {
			if (isFence(line)) {
				inFence = !inFence;
				continue;
			}
			if (inFence) continue;
		}
		if (i <= fmEnd) continue;
		const r = parseAt(c, lines, i, skipLinked);
		if (r) {
			if (rejectedName(r.hit.name, opts)) continue;
			return { ...r.hit, template: tpl };
		}
	}
	return null;
}

interface ParseResult {
	hit: ParsedTemplate;
	/** Number of child lines consumed into `content` (0 for inline/single-line). */
	childCount: number;
}

type CompiledTemplateWithSource = CompiledTemplate & { template: string };

/**
 * Match one line and gather content. Content is the inline value when present;
 * otherwise (or when the template puts `{{Link Content}}` on a child line)
 * indented `- item` bullets below the header are joined into content.
 */
function gatherChildren(lines: string[], i: number): string[] {
	const thisIndent = (lines[i]?.match(/^\s*/)?.[0] ?? '').length;
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
	return children;
}

function parseAt(
	c: CompiledTemplate,
	lines: string[],
	i: number,
	skipLinked: boolean,
): ParseResult | null {
	const line = lines[i];
	if (line === undefined) return null;
	const m = c.header.exec(line);
	if (!m) return null;
	const nameCaptured = m[1];
	if (!nameCaptured?.trim()) return null;
	const name = nameCaptured.trim();
	// Skip a phrase whose name region overlaps an existing `[[...]]` span so a
	// second run on already-linked output is a no-op (idempotency).
	if (skipLinked) {
		const prefix = line.match(/^\s*[-*]\s*/)?.[0]?.length ?? 0;
		if (overlapsExistingLink(line, prefix, prefix + nameCaptured.length)) return null;
	}
	const out: ParsedTemplate = { name, lineIndex: i };
	const aliasCaptured = m[2];
	if (aliasCaptured) out.alias = aliasCaptured.trim();
	let childCount = 0;
	if (c.hasContent) {
		const ci = c.fields.indexOf('content');
		const captured = m[ci + 1];
		let content = captured?.trim() ?? '';
		// Children win over inline when children exist (for a child template),
		// and are used as a fallback when a line has no inline content.
		if (!content || c.contentIsChild) {
			const children = gatherChildren(lines, i);
			if (children.length) {
				content = children.join('\n');
				childCount = children.length;
			}
		}
		if (content) out.content = content;
	}
	return { hit: out, childCount };
}
