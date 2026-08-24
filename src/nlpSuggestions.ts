import { extractKeywords } from './keywords.ts';
import { rootForm } from './nlp.ts';
import type { Suggestion } from './ui/suggestion.ts';

/**
 * NLP has no content template: suggestions only create notes + variant aliases.
 * `nlpRoot` records the lemmatized form the keyword was grouped under.
 */
export function nlpSuggestions(doc: string, extraStopwords: string[] = []): Suggestion[] {
	return extractKeywords(doc, { extraStopwords }).map((k) => ({
		name: k.name,
		aliases: k.aliases,
		count: k.count,
		hits: [],
		nlpRoot: rootForm(k.name.toLowerCase()),
	}));
}
