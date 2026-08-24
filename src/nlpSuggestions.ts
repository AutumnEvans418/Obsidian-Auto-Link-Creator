import { extractKeywords } from './keywords.ts';
import type { Suggestion } from './ui/suggestion.ts';

/** NLP has no content template: suggestions only create notes + variant aliases. */
export function nlpSuggestions(doc: string, extraStopwords: string[] = []): Suggestion[] {
	return extractKeywords(doc, { extraStopwords }).map((k) => ({
		name: k.name,
		aliases: k.aliases,
		count: k.count,
		hits: [],
	}));
}
