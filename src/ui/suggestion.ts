import type { ParsedTemplate } from '../template.ts';

export interface Suggestion {
	name: string;
	aliases: string[];
	content?: string;
	/** How many times this reference appears (NLP groups count variants). */
	count?: number;
	/** Singular template hits to turn into links after note creation. */
	hits: ParsedTemplate[];
	/** Paths of files that reference this note (vault-wide scan). */
	sources?: string[];
	/** Template patterns that produced the hits (deduped, in first-seen order). */
	templates?: string[];
	/** Lemmatized root the NLP detector grouped this keyword under. */
	nlpRoot?: string;
	/** Resolved folder to create the note in (vault-wide scan). */
	targetFolder?: string;
}

/** Keyword source a suggestion was found by. */
export type SuggestionKind = 'template' | 'nlp';

export function suggestionKinds(s: Suggestion): SuggestionKind[] {
	const kinds: SuggestionKind[] = [];
	if (s.templates?.length) kinds.push('template');
	if (s.nlpRoot) kinds.push('nlp');
	return kinds;
}

/** Keep only suggestions found by the preview's configured keyword source. */
export function filterByPreviewMode(
	suggestions: Suggestion[],
	mode: 'both' | 'template' | 'nlp',
): Suggestion[] {
	if (mode === 'both') return suggestions;
	return suggestions.filter((s) => suggestionKinds(s).includes(mode));
}
