import nlp from 'compromise';

/**
 * Lemmatized root. Compromise reads this from term morphology:
 * `changed`/`changing` → `change`, `went` → `go`, `children` → `child`.
 */
export function rootForm(word: string): string {
	const json = nlp(word.toLowerCase()).compute('root').json() as Array<{
		terms?: Array<{ root?: string }>;
	}>;
	return json[0]?.terms?.[0]?.root ?? word;
}

/**
 * Inflect a bare noun between singular/plural. A lone word like `party` or
 * `cows` is ambiguously tagged by compromise, so we prefix the article `the`
 * to force the noun sense, flip inflection, then strip it.
 */
function inflectNoun(word: string, makePlural: boolean): string {
	// compromise fails to inflect Title Case phrases; work in lowercase.
	const nouns = nlp(`the ${word.toLowerCase()}`).nouns();
	const inflected = makePlural ? nouns.toPlural() : nouns.toSingular();
	const out = String(inflected.out('text') ?? '')
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

/** Capitalize the first letter of each word: `access control` → `Access Control`. */
export function titleCase(text: string): string {
	return text.replace(/\b(\p{L})/gu, (m: string) => m.toUpperCase());
}

/** Distinct normalized variants of a phrase: plural, singular, root, stripped. */
export function variantForms(phrase: string): string[] {
	const base = phrase.toLowerCase().replace(/\s+/g, ' ').trim();
	const set = new Set<string>();
	const add = (s: string) => {
		s = s.trim().toLowerCase();
		if (s) set.add(s);
	};
	add(base);
	add(rootForm(phrase));
	add(pluralize(phrase));
	add(singularize(phrase));
	add(base.replace(/[^a-z0-9]+/g, ' ').trim());
	return [...set];
}

/** True when two names are the same reference under any shared form. */
export function sameReference(a: string, b: string): boolean {
	const A = variantForms(a);
	const B = new Set(variantForms(b));
	return A.some((x) => B.has(x));
}
