/** Self-link guard: a link whose target note is the current note. */
import { sameReference } from './nlp.ts';
import type { Suggestion } from './ui/suggestion.ts';
import type { ParsedTemplate } from './template.ts';

/** Note name (path without `.md`) for a source path, e.g. `a/Bovine.md` → `Bovine`. */
export function basenameOf(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
}

/** True when a suggestion's note is the current note, i.e. linking it would self-link. */
export function isSelfSuggestion(s: Suggestion, basename: string): boolean {
	return !!basename && sameReference(s.name, basename);
}

/** Drop suggestions whose note is the current note. */
export function filterSelfSuggestions(
	list: Suggestion[],
	basename: string,
): Suggestion[] {
	return basename ? list.filter((s) => !isSelfSuggestion(s, basename)) : list;
}

/** Drop hits whose link target (resolved or literal) is the current note. */
export function filterSelfHits<T extends ParsedTemplate>(
	hits: T[],
	basename: string,
): T[] {
	return basename
		? hits.filter((h) => !sameReference(h.target ?? h.name, basename))
		: hits;
}