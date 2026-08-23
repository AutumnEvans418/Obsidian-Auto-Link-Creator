import { rootForm, titleCase, variantForms } from './nlp.ts';

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

interface Ngram {
	key: string;
	forms: Map<string, number>;
	count: number;
}

interface Corpus {
	groups: Map<string, Ngram>;
	minFreq: number;
	isContent: (w: string) => boolean;
	maxN: number;
}

function buildCorpus(opts: NlpOptions): Corpus {
	const minWordLen = opts.minWordLen ?? 3;
	const stopwords = new Set(STOPWORDS);
	for (const w of opts.extraStopwords ?? []) {
		const t = w.trim().toLowerCase();
		if (t) stopwords.add(t);
	}
	return {
		groups: new Map(),
		minFreq: opts.minFreq ?? 2,
		maxN: opts.maxNgram ?? 3,
		isContent: (w) => w.length >= minWordLen && !stopwords.has(w) && /[a-z]/.test(w),
	};
}

/** Count n-grams in a single document into `corpus.groups`. */
function countText(corpus: Corpus, text: string): void {
	const words = text
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/\[\[.*?\]\]/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[^\p{L}\s-]/gu, ' ')
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);

	for (let i = 0; i < words.length; i++) {
		const wi = words[i];
		if (!wi || !corpus.isContent(wi)) continue;
		for (let n = 1; n <= corpus.maxN; n++) {
			if (i + n > words.length) break;
			const ngram = words.slice(i, i + n);
			if (!ngram.every((w) => !!w && corpus.isContent(w))) break; // contiguous content only
			const key = ngram
				.map((w) => rootForm(w))
				.join(' ');
			const surface = ngram.join(' ');
			let g = corpus.groups.get(key);
			if (!g) {
				g = { key, forms: new Map(), count: 0 };
				corpus.groups.set(key, g);
			}
			g.count++;
			g.forms.set(surface, (g.forms.get(surface) ?? 0) + 1);
		}
	}
}

/** Emit hits for n-grams seen at least `minFreq` times in the whole corpus. */
function emit(corpus: Corpus): KeywordHit[] {
	const out: KeywordHit[] = [];
	for (const g of corpus.groups.values()) {
		if (g.count < corpus.minFreq) continue;
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
	const corpus = buildCorpus(opts);
	countText(corpus, text);
	return emit(corpus);
}

/**
 * Like `extractKeywords` but accumulates frequency across every document first,
 * then applies `minFreq` once. A phrase used once in each of several files thus
 * counts together instead of being per-file minimums. Use for vault-wide scans.
 */
export function extractKeywordsFromDocs(docs: string[], opts: NlpOptions = {}): KeywordHit[] {
	const corpus = buildCorpus(opts);
	for (const doc of docs) countText(corpus, doc);
	return emit(corpus);
}
