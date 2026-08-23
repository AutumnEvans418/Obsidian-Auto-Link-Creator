import type { ParsedTemplate } from '../template';

export interface Suggestion {
	name: string;
	aliases: string[];
	content?: string;
	/** Singular template hits to turn into links after note creation. */
	hits: ParsedTemplate[];
}

interface Props {
	suggestions: Suggestion[];
	onApply: (indices: number[]) => void;
	onCancel: () => void;
}
