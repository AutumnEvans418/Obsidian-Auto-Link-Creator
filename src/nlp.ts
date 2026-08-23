import nlp from 'compromise';

/**
 * Lemmatized root. Compromise reads this from term morphology:
 * `changed`/`changing` → `change`, `went` → `go`, `children` → `child`.
 */
export function rootForm(word: string): string {
	return nlp(word).compute('root').json()[0]?.terms[0]?.root ?? word;
}

/**
 * Inflect a bare noun between singular/plural. A lone word like `party` or
 * `cows` is ambiguously tagged by compromise, so we prefix the article `the`
 * to force the noun sense, flip inflection, then strip it.
 */
function inflectNoun(word: string, makePlural: boolean): string {
	const nouns = nlp(`the ${word}`).nouns();
	const out = (makePlural ? nouns.toPlural() : nouns.toSingular())
		.out('text')
		.trim()
		.replace(/^the\s+/i, '');
	return out || word;
}

/** Plural form of a noun: `cow` → `cows`, `party` → `parties`. */
export function pluralize(word: string): string {
	return inflectNoun(word, true);
}

/** Singular form of a noun: `cows` → `cow`, `children` → `child`. */
export function singularize(word: string): string {
	return inflectNoun(word, false);
}
