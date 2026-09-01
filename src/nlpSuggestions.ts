import { extractKeywords, extractKeywordsFromDocs } from './keywords.ts';
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

/**
 * NLP suggestions for the active note using whole-vault frequency context:
 * counts a phrase across every note so one that appears once here but is
 * common elsewhere in the vault still gets recommended. Only phrases whose
 * surface form actually appears in `currentDoc` are kept, so the list stays
 * about the current note rather than a vault-wide dump. `otherDocs` is every
 * other note's text; `currentDoc` is the live source (may differ from disk).
 */
export function vaultContextNlpSuggestions(
	currentDoc: string,
	otherDocs: string[],
	extraStopwords: string[] = [],
): Suggestion[] {
	const hits = extractKeywordsFromDocs([currentDoc, ...otherDocs], { extraStopwords });
	const cur = currentDoc.toLowerCase();
	return hits
		.filter((k) => cur.includes(k.name.toLowerCase()))
		.map((k) => ({
			name: k.name,
			aliases: k.aliases,
			count: k.count,
			hits: [],
			nlpRoot: rootForm(k.name.toLowerCase()),
		}));
}
