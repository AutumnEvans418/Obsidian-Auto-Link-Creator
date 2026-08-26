import { wikiSpans } from './linkDetector.ts';
import { titleCase, variantForms } from './nlp.ts';
import type { ParsedTemplate } from './template.ts';

/** A note that phrases in a document can be linked to. */
export interface IndexEntry {
	path: string;
	basename: string;
	aliases: string[];
}

export type MatchMode = 'exact' | 'root';

/**
 * Shared directory prefix depth between two file paths.
 * `a/b/c.md` vs `a/b/d.md` → 2; `a/b.md` vs `x/y.md` → 0.
 */
function sharedDirDepth(a: string, b: string): number {
	const aParts = a.split('/');
	const bParts = b.split('/');
	// Compare all parts except the filename (last element).
	const aDirs = aParts.slice(0, -1);
	const bDirs = bParts.slice(0, -1);
	let i = 0;
	while (i < aDirs.length && i < bDirs.length && aDirs[i] === bDirs[i]) i++;
	return i;
}

/**
 * Lookup keys → note basename. `exact` indexes the lowercased name/alias;
 * `root` additionally indexes plural/singular/lemmatized variants so e.g.
 * "cows" resolves to the note "Cow". When `currentPath` is provided, ties
 * are broken by folder proximity (closest note wins).
 */
export function buildNoteIndex(
	entries: IndexEntry[],
	mode: MatchMode,
	currentPath?: string,
): Map<string, string> {
	const index = new Map<string, string>();
	const sorted = currentPath
		? [...entries].sort((a, b) => {
			// Closer to current file's directory wins; alphabetical as final tiebreak.
			return sharedDirDepth(b.path, currentPath) - sharedDirDepth(a.path, currentPath)
				|| a.path.localeCompare(b.path);
		})
		: [...entries].sort((a, b) => a.path.localeCompare(b.path));
	for (const e of sorted) {
		for (const name of [e.basename, ...e.aliases]) {
			if (!name) continue;
			const keys = mode === 'root' ? variantForms(name.toLowerCase()) : [name.toLowerCase()];
			for (const key of keys) {
				if (!index.has(key)) index.set(key, e.basename);
			}
		}
	}
	return index;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Match {
	start: number;
	end: number;
	basename: string;
	surface: string;
}

export interface ExistingLinkOptions {
	capitalize?: boolean;
	/** Skip matches whose basename equals this (avoid self-links). */
	excludeBasename?: string;
}

function overlapsAny(
	spans: Array<{ start: number; end: number }>,
	start: number,
	end: number,
): boolean {
	return spans.some((s) => start < s.end && end > s.start);
}

/**
 * Point each hit at an existing note when its name is the same reference
 * (exact or variant match per `mode`), so `Armor Classes` links to the
 * `Armor Class` note instead of self-linking. Self-hits keep no target.
 */
export function foldHitTargets(
	hits: ParsedTemplate[],
	index: Map<string, string>,
	mode: MatchMode = 'root',
): void {
	for (const h of hits) {
		const forms =
			mode === 'root'
				? [h.name.toLowerCase(), ...variantForms(h.name.toLowerCase())]
				: [h.name.toLowerCase()];
		for (const form of forms) {
			const base = index.get(form);
			if (base && base.toLowerCase() !== h.name.toLowerCase()) {
				h.target = base;
				break;
			}
		}
	}
}

/**
 * Replace plain-text occurrences of indexed note names/aliases with wiki
 * links to those notes. Skips matches inside `[[...]]` spans, fenced code
 * blocks, and frontmatter. The original surface text is kept as the link
 * alias unless it equals the note name (then a bare `[[Name]]`), so linked
 * output contains no bare occurrences left to match (idempotent).
 */
export function applyExistingLinks(
	doc: string,
	index: Map<string, string>,
	opts: ExistingLinkOptions = {},
): { updated: string; count: number } {
	if (!index.size) return { updated: doc, count: 0 };
	const capitalize = opts.capitalize ?? true;
	const lines = doc.split('\n');
	const out: string[] = [];
	let count = 0;
	let inFence = false;
	// Frontmatter block (first --- ... ---) never gets linked.
	const fmEnd =
		lines[0]?.trim() === '---' ? lines.findIndex((l, i) => i > 0 && l.trim() === '---') : -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		if (/^```/.test(line)) {
			inFence = !inFence;
			out.push(line);
			continue;
		}
		if (inFence || (fmEnd !== -1 && i <= fmEnd) || !line.trim()) {
			out.push(line);
			continue;
		}

		const matches: Match[] = [];
		for (const [key, basename] of index) {
			if (basename === opts.excludeBasename) continue;
			for (const m of line.matchAll(new RegExp(`(?<![\\w])${escapeRe(key)}(?![\\w])`, 'gi'))) {
				matches.push({
					start: m.index ?? 0,
					end: (m.index ?? 0) + key.length,
					basename,
					surface: m[0] ?? '',
				});
			}
		}
		matches.sort((a, b) => a.start - b.start || b.end - a.end);
		const taken = wikiSpans(line);
		const accepted: Match[] = [];
		for (const m of matches) {
			if (overlapsAny(taken, m.start, m.end)) continue;
			accepted.push(m);
			taken.push({ start: m.start, end: m.end });
		}
		if (!accepted.length) {
			out.push(line);
			continue;
		}
		let updatedLine = '';
		let cursor = 0;
		for (const m of accepted) {
			updatedLine += line.slice(cursor, m.start);
			const display = capitalize ? titleCase(m.surface) : m.surface;
			updatedLine +=
				display.toLowerCase() === m.basename.toLowerCase()
					? `[[${m.basename}]]`
					: `[[${m.basename}|${display}]]`;
			cursor = m.end;
			count++;
		}
		updatedLine += line.slice(cursor);
		out.push(updatedLine);
	}
	return { updated: out.join('\n'), count };
}
