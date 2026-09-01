import { sameReference } from './nlp.ts';
import { wikiSpans } from './linkDetector.ts';
import { frontmatterEnd, isDateLike, makeCodeblockFilter } from './validation.ts';
import type { CodeblockFilterOptions } from './validation.ts';

export interface ParsedTemplate {
	name: string;
	alias?: string;
	content?: string;
	lineIndex: number;
	/** Column where `name` begins in its line (for splice-based linking). */
	nameStart?: number;
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

/** Escapes a string for literal use inside a RegExp source. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Line shape implied by the template's literal prefix before `{{Link Name}}`:
 * `- `/`* ` bullets (classic), `|` table cells, `> ` callouts/quotes, and
 * anything else (headers, footnotes, numbered lists) as a literal prefix.
 */
export type Shape = 'bullet' | 'table' | 'quote' | 'literal';

function shapeOf(tpl: string): Shape {
	const m = /^([\s\S]*?)\{\{\s*link\s+name\s*\}\}/i.exec(tpl);
	const first = (m?.[1] ?? '').trimStart()[0];
	if (first === '|') return 'table';
	if (first === '>') return 'quote';
	if (first === '-' || first === '*') return 'bullet';
	return 'literal';
}

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

/**
 * Build a regex for non-bullet shapes by walking the template's literal text
 * and field placeholders. Literals are escaped and whitespace-flexed; digits
 * in the head become `\d+` so `1. ` and `[^1]:` match any index/number. Table
 * cells capture up to the next pipe; name is always group 1.
 */
function templateRegexp(tpl: string, fields: Field[], shape: Shape): RegExp {
	const pos: Record<Field, number> = { name: 0, alias: 0, content: 0 };
	let g = 1;
	for (const f of fields) pos[f] = g++;
	const cell = shape === 'table' ? '[^|]*?' : '.+?';
	let src = '^\\s*';
	let last = 0;
	let inHead = true;
	tpl.replace(FIELD_KEY, (_m, key: string, offset: number) => {
		let lit = escapeRe(tpl.slice(last, offset)).replace(/[ \t]+/g, '\\s+');
		if (inHead) lit = lit.replace(/\d+/g, '\\d+');
		src += lit;
		const f = key.toLowerCase() as Field;
		src += f === 'name' ? '(.+?)' : `(${cell})`;
		if (f === 'name') inHead = false;
		last = offset + _m.length;
		return '';
	});
	const tail = escapeRe(tpl.slice(last)).replace(/[ \t]+/g, '\\s+');
	return new RegExp(src + tail + '\\s*$', 'i');
}

/** True when the template's `{{Link Content}}` sits on its own child line. */
function contentIsChild(tpl: string): boolean {
	const pos = tpl.lastIndexOf('{{Link Content}}');
	return pos >= 0 && tpl.slice(0, pos).includes('\n');
}

export interface CompiledTemplate {
	fields: Field[];
	shape: Shape;
	header: RegExp;
	hasContent: boolean;
	contentIsChild: boolean;
}

export function compileTemplate(tpl: string): CompiledTemplate | null {
	const fields = fieldsOf(tpl);
	if (!fields.includes('name')) return null;
	const shape = shapeOf(tpl);
	return {
		fields,
		shape,
		header: shape === 'bullet' ? headerRegexp(fields) : templateRegexp(tpl, fields, shape),
		hasContent: fields.includes('content'),
		contentIsChild: contentIsChild(tpl),
	};
}

/**
 * Match a text block against a template; returns the first hit. Child-line
 * content (indented `- item` below the header) is joined into `content`.
 */
export interface TemplateOptions extends CodeblockFilterOptions {
	/**
	 * Skip a phrase whose name region overlaps an existing `[[...]]` span, so
	 * re-running on already-linked output is a no-op. Default true.
	 */
	skipLinked?: boolean;
	/**
	 * Still match when an existing link overlaps only PART of the name (the
	 * linked span is shorter than the name). Fixes the typing-fail case where
	 * the existing-links pass already linked the first word of a longer
	 * definition, so preview can suggest the whole phrase. Default true.
	 */
	matchLongerAcrossLinks?: boolean;
	/** Skip hits whose name is date/number-like (e.g. `2026-08-24`). */
	ignoreDates?: boolean;
}

/** True when a matched name should be dropped: junk (`--`) or date-like. */
/**
 * Strip markdown formatting from a captured name so suggestions don't include
 * checkbox markers (`[ ]`, `[x]`), numbered-list prefixes (`1.`), heading/tag
 * markers (`#`, `# `), or inline wrapping (`**bold**`, `~~strike~~`,
 * `***bold-italic***`, `__underline__`). Returns the cleaned name and how many
 * leading characters were removed (for `nameStart` adjustment).
 */
function stripFormatting(raw: string): { name: string; offset: number } {
	let s = raw;
	let offset = 0;

	// Leading heading/tag marker:  `# Name`, `#Name`, or `## Name`
	const hash = s.match(/^#+\s*/);
	if (hash && s.length > hash[0].length) {
		offset += hash[0].length;
		s = s.slice(hash[0].length);
	}

	// Leading task-list checkbox:  `- [ ] Foo` or `- [x] Foo`
	const chk = s.match(/^\[[ xX]\]\s*/);
	if (chk) {
		offset += chk[0].length;
		s = s.slice(chk[0].length);
	}

	// Leading numbered-list marker:  `1. Foo`
	const num = s.match(/^\d+\.\s*/);
	if (num) {
		offset += num[0].length;
		s = s.slice(num[0].length);
	}

	// Inline formatting wrapping the entire name (longest opener first)
	const pairs = ['***', '**', '__', '~~', '*'] as const;
	for (const op of pairs) {
		if (s.startsWith(op) && s.endsWith(op) && s.length > op.length * 2) {
			s = s.slice(op.length, -op.length);
			offset += op.length;
			break;
		}
	}

	return { name: s.trim(), offset };
}

function rejectedName(name: string, opts: TemplateOptions): boolean {
	const ignoreDates = opts.ignoreDates ?? true;
	// Punctuation-only junk ("--") is never a link name; numeric/date-like
	// names ("2026", "2026-08-24T…") follow the ignore-dates setting.
	if (!/\p{L}/u.test(name)) return !/\d/.test(name) || ignoreDates;
	return ignoreDates && isDateLike(name);
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
	const skipLinked = opts.skipLinked ?? true;
	const allowPartial = opts.matchLongerAcrossLinks ?? false;
	const fmEnd = frontmatterEnd(lines);
	const codeblock = makeCodeblockFilter(opts);
	let skipUntil = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (codeblock(line)) continue;
		if (i <= fmEnd || i < skipUntil) continue;
		const r = parseAt(c, lines, i, skipLinked, allowPartial);
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
	const skipLinked = opts.skipLinked ?? true;
	const allowPartial = opts.matchLongerAcrossLinks ?? false;
	const fmEnd = frontmatterEnd(lines);
	const codeblock = makeCodeblockFilter(opts);
	let skipUntil = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (codeblock(line)) continue;
		if (i <= fmEnd || i < skipUntil) continue;
		for (const c of comps) {
			const r = parseAt(c, lines, i, skipLinked, allowPartial);
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
	const skipLinked = opts.skipLinked ?? true;
	const allowPartial = opts.matchLongerAcrossLinks ?? false;
	const fmEnd = frontmatterEnd(lines);
	const codeblock = makeCodeblockFilter(opts);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (codeblock(line)) continue;
		if (i <= fmEnd) continue;
		const r = parseAt(c, lines, i, skipLinked, allowPartial);
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

/** Contiguous `> ` lines below a matched callout header become its body. */
function gatherQuoteChildren(lines: string[], i: number): string[] {
	const children: string[] = [];
	for (let j = i + 1; j < lines.length; j++) {
		const child = lines[j];
		if (child === undefined || !/^\s*>\s?/.test(child)) break;
		const v = child.replace(/^\s*>\s?/, '');
		if (v.trim()) children.push(v.trim());
	}
	return children;
}

function gatherFor(shape: Shape): (lines: string[], i: number) => string[] {
	return shape === 'quote' ? gatherQuoteChildren : gatherChildren;
}

/**
 * Strip the `[[`/`]]` markers of wikilink spans that overlap a captured name
 * region, so a partially-linked phrase keeps only its plain text. Returns the
 * cleaned name and the start index of that text in the original line.
 */
function unwrapName(
	line: string,
	captured: string,
	capturedStart: number,
	spans: Array<{ start: number; end: number }>,
): { name: string; nameStart: number } {
	const regionEnd = capturedStart + captured.length;
	const overlapping = spans.filter(
		(s) => capturedStart < s.end && regionEnd > s.start && !(s.start <= capturedStart && s.end >= regionEnd),
	);
	if (!overlapping.length) return { name: captured, nameStart: capturedStart };
	const removed = new Array<boolean>(line.length).fill(false);
	for (const s of overlapping) {
		removed[s.start] = true;
		removed[s.start + 1] = true;
		removed[s.end - 2] = true;
		removed[s.end - 1] = true;
	}
	let name = '';
	for (let i = capturedStart; i < regionEnd; i++) {
		if (removed[i]) continue;
		name += line[i] ?? '';
	}
	// Markers before the name move it left; markers inside leave it put.
	return { name, nameStart: capturedStart - countBefore(removed, capturedStart) };
}

function countBefore(removed: boolean[], until: number): number {
	let n = 0;
	for (let i = 0; i < until; i++) if (removed[i]) n++;
	return n;
}

function parseAt(
	c: CompiledTemplate,
	lines: string[],
	i: number,
	skipLinked: boolean,
	allowPartialLink: boolean,
): ParseResult | null {
	const line = lines[i];
	if (line === undefined) return null;
	const m = c.header.exec(line);
	if (!m) return null;
	const nameCaptured = m[1];
	if (!nameCaptured?.trim()) return null;
	const captured = nameCaptured.trim();
	const capturedStart = line.indexOf(captured);
	// Skip a phrase whose name region overlaps an existing `[[...]]` span so a
	// second run on already-linked output is a no-op (idempotency). When the
	// entire name is already wrapped, always skip (pure re-link); when only a
	// part is linked, keep it if `matchLongerAcrossLinks` allows the longer
	// definition to win.
	let spans: Array<{ start: number; end: number }> = [];
	if (skipLinked) {
		spans = wikiSpans(line);
		const regionEnd = capturedStart + captured.length;
		let overlaps = false;
		let fullyCovered = false;
		for (const s of spans) {
			if (capturedStart < s.end && regionEnd > s.start) overlaps = true;
			if (s.start <= capturedStart && s.end >= regionEnd) fullyCovered = true;
		}
		if (fullyCovered) return null;
		if (overlaps && !allowPartialLink) return null;
	}
	// When a partial link overlaps the name, unwrap the `[[ ]]` markers from
	// the captured text so the stored name equals the plain phrase applyLinks
	// will finally wrap (e.g. `[[Security]] Education…` → `Security Education…`).
	let { name, nameStart } = unwrapName(line, captured, capturedStart, spans);
	const fmt = stripFormatting(name);
	name = fmt.name;
	nameStart += fmt.offset;
	const out: ParsedTemplate = { name, nameStart, lineIndex: i };
	const aliasCaptured = c.fields.includes('alias') ? m[2] : undefined;
	if (aliasCaptured) out.alias = stripFormatting(aliasCaptured.trim()).name;
	let childCount = 0;
	if (c.hasContent) {
		const ci = c.fields.indexOf('content');
		const capturedContent = m[ci + 1];
		let content = capturedContent?.trim() ?? '';
		// Children win over inline when children exist (for a child template),
		// and are used as a fallback when a line has no inline content.
		if (!content || c.contentIsChild) {
			const children = gatherFor(c.shape)(lines, i);
			if (children.length) {
				content = children.join('\n');
				childCount = children.length;
			}
		}
		if (content) out.content = content;
	} else if (c.shape === 'quote') {
		// A bare callout template (`> [!note] {{Link Name}}`) takes its body
		// lines as content.
		const children = gatherQuoteChildren(lines, i);
		if (children.length) {
			out.content = children.join('\n');
			childCount = children.length;
		}
	}
	return { hit: out, childCount };
}
