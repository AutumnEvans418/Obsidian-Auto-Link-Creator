import { rootForm, titleCase, variantForms } from './nlp.ts';
import { frontmatterEnd } from './validation.ts';

/** Common English words that carry little keyword signal. */
const STOPWORDS = new Set([
	'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'in', 'on', 'at', 'to', 'for',
	'with', 'without', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
	'being', 'am', 'do', 'does', 'did', 'have', 'has', 'had', 'this', 'that', 'these',
	'those', 'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her',
	'us', 'them', 'my', 'your', 'his', 'their', 'our', 'so', 'if', 'then', 'than',
	'also', 'not', 'no', 'yes', 'there', 'here', 'when', 'where', 'which', 'who',
	'whom', 'what', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
	'most', 'some', 'any', 'own', 'same', 'other', 'such', 'can', 'will', 'would',
	'should', 'may', 'might', 'must', 'about', 'into', 'over', 'under', 'against',
	'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off',
]);

export interface NlpOptions {
	/** A phrase must appear at least this many times to be suggested. */
	minFreq?: number;
	/** Drop words shorter than this many characters. */
	minWordLen?: number;
	/** Longest n-word phrase to consider (1 = single words only). */
	maxNgram?: number;
	/** Extra stop words to ignore, merged with the built-in set. */
	extraStopwords?: string[];
}

export interface KeywordHit {
	/** Display name: the most frequent surface form, title-cased. */
	name: string;
	/** All variant forms (plural/singular/root) of `name`, minus `name` itself. */
	aliases: string[];
	/** How many times the reference was found. */
	count: number;
}

/**
 * Per-file n-gram contribution: lemmatized n-gram key → total count plus how
 * often each surface spelling of it appeared. Serializable via
 * {@link ngramCountsToPlain} (Maps → nested objects) for persistence.
 */
export interface NgramCounts {
	count: number;
	forms: Map<string, number>;
}

export type FileNgrams = Map<string, NgramCounts>;

interface Config {
	minFreq: number;
	minWordLen: number;
	maxN: number;
	isContent: (w: string) => boolean;
}

function config(opts: NlpOptions): Config {
	const minWordLen = opts.minWordLen ?? 3;
	const stopwords = new Set(STOPWORDS);
	for (const w of opts.extraStopwords ?? []) {
		const t = w.trim().toLowerCase();
		if (t) stopwords.add(t);
	}
	return {
		minFreq: opts.minFreq ?? 2,
		minWordLen,
		maxN: opts.maxNgram ?? 3,
		isContent: (w) => w.length >= minWordLen && !stopwords.has(w) && /[a-z]/.test(w),
	};
}

/** Split a note into lowercase prose words, dropping code/wikilink/markdown noise. */
function tokenize(text: string): string[] {
	// Frontmatter (dates, keys) never counts as prose.
	const lines = text.split('\n');
	const fmEnd = frontmatterEnd(lines);
	const body = fmEnd === -1 ? text : lines.slice(fmEnd + 1).join('\n');
	return body
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/\[\[.*?\]\]/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[^\p{L}\s-]/gu, ' ')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
}

/**
 * Count n-grams in one document's token stream into `agg`. Contiguous content
 * words only; `Cow`/`Cows` collapse onto one lemmatized key, surfaces tracked
 * per spelling so the display name stays the most frequent literal form.
 */
function countInto(agg: FileNgrams, words: string[], cfg: Config): void {
	for (let i = 0; i < words.length; i++) {
		const wi = words[i];
		if (!wi || !cfg.isContent(wi)) continue;
		for (let n = 1; n <= cfg.maxN; n++) {
			if (i + n > words.length) break;
			const ngram = words.slice(i, i + n);
			if (!ngram.every((w) => !!w && cfg.isContent(w))) break; // contiguous content only
			const key = ngram.map((w) => rootForm(w)).join(' ');
			const surface = ngram.join(' ');
			let g = agg.get(key);
			if (!g) {
				g = { count: 0, forms: new Map() };
				agg.set(key, g);
			}
			g.count++;
			g.forms.set(surface, (g.forms.get(surface) ?? 0) + 1);
		}
	}
}

/**
 * Per-file n-gram counts for a single note. Keyed by lemmatized n-gram so the
 * vault cache can recount one file and merge the diff into a shared aggregate.
 */
export function ngramsFor(text: string, opts: NlpOptions = {}): FileNgrams {
	const cfg = config(opts);
	const agg: FileNgrams = new Map();
	countInto(agg, tokenize(text), cfg);
	return agg;
}

/** Sum `src` into `target` (counts and per-surface forms), mutating `target`. */
export function mergeNgrams(target: FileNgrams, src: FileNgrams): void {
	for (const [key, s] of src) {
		let t = target.get(key);
		if (!t) {
			t = { count: 0, forms: new Map() };
			target.set(key, t);
		}
		t.count += s.count;
		for (const [surf, c] of s.forms) {
			t.forms.set(surf, (t.forms.get(surf) ?? 0) + c);
		}
	}
}

/** Emit hits for n-grams seen at least `minFreq` times across the aggregate. */
export function emitNgrams(ngrams: FileNgrams, minFreq: number): KeywordHit[] {
	const out: KeywordHit[] = [];
	for (const g of ngrams.values()) {
		if (g.count < minFreq) continue;
		// Most frequent surface spelling wins the display name (lowercased so
		// compromise inflects it; compromise ignores capitalised input).
		const lead = [...g.forms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
		if (!lead) continue;
		const name = titleCase(lead);
		out.push({
			name,
			aliases: variantForms(lead).filter((a) => a !== lead),
			count: g.count,
		});
	}
	return out.sort((a, b) => b.count - a.count);
}

/**
 * Extract repeated, useful phrases from a single document. Tokenizes, strips
 * punctuation and stop-words, groups n-grams by their lemmatized root so
 * `Cow`/`Cows`, `Party`/`Parties` collapse to one reference, and returns only
 * phrases seen `minFreq`+ times. Aliases include forms that never appear.
 */
export function extractKeywords(text: string, opts: NlpOptions = {}): KeywordHit[] {
	return emitNgrams(ngramsFor(text, opts), config(opts).minFreq);
}

/**
 * Like `extractKeywords` but accumulates frequency across every document first,
 * then applies `minFreq` once. A phrase used once in each of several files thus
 * counts together instead of being per-file minimums. Use for vault-wide scans.
 */
export function extractKeywordsFromDocs(docs: string[], opts: NlpOptions = {}): KeywordHit[] {
	const agg: FileNgrams = new Map();
	for (const doc of docs) mergeNgrams(agg, ngramsFor(doc, opts));
	return emitNgrams(agg, config(opts).minFreq);
}

/** Flatten [key → {count, forms:Map}] to a plain nested object for saveData. */
export function ngramCountsToPlain(ngrams: FileNgrams): Record<string, { count: number; forms: Record<string, number> }> {
	const out: Record<string, { count: number; forms: Record<string, number> }> = {};
	for (const [key, g] of ngrams) {
		const forms: Record<string, number> = {};
		for (const [surf, c] of g.forms) forms[surf] = c;
		out[key] = { count: g.count, forms };
	}
	return out;
}

/** Rehydrate a plain nested object (from saveData) into {@link FileNgrams}. */
export function ngramCountsFromPlain(
	plain: Record<string, { count: number; forms: Record<string, number> }>,
): FileNgrams {
	const out: FileNgrams = new Map();
	for (const [key, g] of Object.entries(plain)) {
		out.set(key, { count: g.count, forms: new Map(Object.entries(g.forms)) });
	}
	return out;
}

/** Emit vault-wide keywords by merging per-file caches, keeping cache-resident shapes. */
