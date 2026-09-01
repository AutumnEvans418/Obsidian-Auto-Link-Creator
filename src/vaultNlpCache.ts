import {
	emitNgrams,
	mergeNgrams,
	ngramCountsFromPlain,
	ngramCountsToPlain,
	ngramsFor,
	type FileNgrams,
	type NlpOptions,
} from './keywords.ts';
import { rootForm, titleCase } from './nlp.ts';
import type { Suggestion } from './ui/suggestion.ts';

/**
 * Cache modeling the vault as a bag of per-file n-gram counts. A note's
 * counts are keyed by `(mtime, optsKey)` so a recount is skipped unless that
 * file actually changed or the NLP wordlist changed. Vault-wide suggestions
 * merge each file's cached counts (O(files) summations, no re-tokenizing)
 * instead of re-reading and re-NLP-ing every note on each preview.
 */
export interface CachedFile {
	mtime: number;
	/** Distinguishes counts built under different stopword/len/ngram opts. */
	optsKey: string;
	ngrams: FileNgrams;
}

export type VaultNlpCache = Map<string, CachedFile>;

/** Options that change counting (stopwords, min word length, max n-gram). */
function optsKey(opts: NlpOptions): string {
	const stop = (opts.extraStopwords ?? []).slice().sort().join('|');
	return [opts.minWordLen ?? 3, opts.maxNgram ?? 3, stop].join('::');
}

export function makeVaultCache(): VaultNlpCache {
	return new Map();
}

/**
 * Store (or refresh) a file's n-gram counts. No-ops when `path` is already
 * cached for this exact `mtime` and `opts`. Returns whether a recount ran.
 */
export function applyDocChange(
	cache: VaultNlpCache,
	path: string,
	mtime: number,
	text: string,
	opts: NlpOptions = {},
): boolean {
	const key = optsKey(opts);
	const existing = cache.get(path);
	if (existing && existing.mtime === mtime && existing.optsKey === key) return false;
	cache.set(path, { mtime, optsKey: key, ngrams: ngramsFor(text, opts) });
	return true;
}

/** Drop cache entries whose paths no longer exist in the vault. */
export function pruneVaultCache(cache: VaultNlpCache, existingPaths: Set<string>): void {
	for (const path of cache.keys()) {
		if (!existingPaths.has(path)) cache.delete(path);
	}
}

/**
 * Vault-context suggestions for the active note: aggregate the cached counts
 * of every other file plus the live `currentDoc`, then keep only phrases whose
 * surface form appears in `currentDoc`. `currentSource` is excluded from the
 * cache (the live editor may differ from what's on disk and is added fresh).
 */
export function vaultSuggestions(
	cache: VaultNlpCache,
	currentSource: string,
	currentDoc: string,
	opts: NlpOptions = {},
): Suggestion[] {
	const agg: FileNgrams = new Map();
	for (const [path, entry] of cache) {
		if (path === currentSource) continue;
		mergeNgrams(agg, entry.ngrams);
	}
	mergeNgrams(agg, ngramsFor(currentDoc, opts));
	const cur = currentDoc.toLowerCase();
	return emitNgrams(agg, opts.minFreq ?? 2)
		.filter((k) => cur.includes(k.name.toLowerCase()))
		.map((k) => ({
			name: k.name,
			aliases: k.aliases,
			count: k.count,
			hits: [],
			nlpRoot: rootForm(k.name.toLowerCase()),
		}));
}

export interface VaultKeywordHit {
	key: string;
	name: string;
	aliases: string[];
	count: number;
	files: Set<string>;
}

/**
 * Aggregate every cached file's n-grams into one bag plus a per-key map of
 * which files contain that lemmatized phrase. Drives vault-wide NLP without
 * re-tokenizing unchanged files (the expensive part).
 */
export function vaultNgramAggregate(
	cache: VaultNlpCache,
): { ngrams: FileNgrams; files: Map<string, Set<string>> } {
	const ngrams: FileNgrams = new Map();
	const files: Map<string, Set<string>> = new Map();
	for (const [path, entry] of cache) {
		mergeNgrams(ngrams, entry.ngrams);
		for (const key of entry.ngrams.keys()) {
			let set = files.get(key);
			if (!set) {
				set = new Set<string>();
				files.set(key, set);
			}
			set.add(path);
		}
	}
	return { ngrams, files };
}

/**
 * Vault-wide keyword hits from the cache, each carrying the lemmatized key and
 * the set of files it appears in (for folder resolution), plus the aggregated
 * count and the most frequent surface form as a title-cased name.
 */
export function vaultKeywordHits(cache: VaultNlpCache, minFreq: number): VaultKeywordHit[] {
	const { ngrams, files } = vaultNgramAggregate(cache);
	const out: VaultKeywordHit[] = [];
	for (const [key, g] of ngrams) {
		if (g.count < minFreq) continue;
		const lead = [...g.forms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
		if (!lead) continue;
		const name = titleCase(lead);
		out.push({
			key,
			name,
			aliases: [],
			count: g.count,
			files: files.get(key) ?? new Set<string>(),
		});
	}
	return out.sort((a, b) => b.count - a.count);
}

/** Plain-object form for `saveData`. */
export function serializeVaultCache(
	cache: VaultNlpCache,
): Record<string, { mtime: number; optsKey: string; ngrams: Record<string, { count: number; forms: Record<string, number> }> }> {
	const out: Record<string, { mtime: number; optsKey: string; ngrams: Record<string, { count: number; forms: Record<string, number> }> }> = {};
	for (const [path, entry] of cache) {
		out[path] = { mtime: entry.mtime, optsKey: entry.optsKey, ngrams: ngramCountsToPlain(entry.ngrams) };
	}
	return out;
}

/** Rehydrate a serialized cache (from `loadData`). */
export function deserializeVaultCache(
	plain: Record<string, { mtime: number; optsKey: string; ngrams: Record<string, { count: number; forms: Record<string, number> }> }> | undefined,
): VaultNlpCache {
	const cache: VaultNlpCache = new Map();
	if (!plain) return cache;
	for (const [path, entry] of Object.entries(plain)) {
		if (entry && entry?.ngrams) cache.set(path, {
			mtime: entry.mtime,
			optsKey: entry.optsKey,
			ngrams: ngramCountsFromPlain(entry.ngrams),
		});
	}
	return cache;
}
