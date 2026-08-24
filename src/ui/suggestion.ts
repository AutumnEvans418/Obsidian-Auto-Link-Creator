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
