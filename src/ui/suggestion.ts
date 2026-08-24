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
	sourceFiles?: string[];
	/** Resolved folder to create the note in (vault-wide scan). */
	targetFolder?: string;
}
