/** Obsidian-free settings schema: importable from unit tests. */
export interface AutoLinkSettings {
	/** Line patterns like `- {{Link Name}} ({{Link Alias}}) - {{Link Content}}`. First match wins. */
	templates: string[];
	/** Skip template/child-line matching inside fenced code blocks (```). */
	ignoreCodeblocks: boolean;
	/** Skip date/number-like phrases (e.g. `2026`, `2026-08-24`) when linking. */
	ignoreDates: boolean;
	/** Capitalize each first letter of note names and link text. */
	capitalize: boolean;
	/** Run keyword detection driven by `templates` lines. */
	enableTemplateKeywords: boolean;
	/** Run NLP keyword detection over note prose (repeated phrases, variants). */
	enableNlpKeywords: boolean;
	/** Extra comma-separated words NLP keyword detection drops. */
	extraStopwords: string;
	/** Open updated/appended notes in background leaves so native Ctrl-Z can undo. */
	openForUndo: boolean;
	/** Auto-link template keywords in the active note when it is saved. */
	onSaveEnabled: boolean;
	/** Show provenance details (source, template, nlp root) in the preview. */
	debug: boolean;
	/** Link phrases that match existing note names or aliases. */
	enableExistingLinks: boolean;
	/** How phrases match notes: exact name/alias text, or nlp root/variant forms. */
	existingMatchMode: 'exact' | 'root';
	/** Auto-link existing-note matches when the active note is saved. */
	existingOnSave: boolean;
	/** Also index unresolved wikilinks (links to files that don't exist yet). */
	linkUnresolved: boolean;
	/** Folder name new notes go into ('' = the source note's own folder). */
	newNoteFolder: string;
	/** How `newNoteFolder` resolves: create a subfolder, or reuse the closest existing one. */
	newFolderMode: 'subfolder' | 'closest';
}

export const DEFAULT_SETTINGS: AutoLinkSettings = {
	templates: [
		'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
		'- {{Link Name}} ({{Link Alias}})',
		'- {{Link Name}} - {{Link Content}}',
	],
	ignoreCodeblocks: true,
	ignoreDates: true,
	capitalize: true,
	enableTemplateKeywords: true,
	enableNlpKeywords: true,
	extraStopwords: '',
	openForUndo: true,
	onSaveEnabled: false,
	debug: false,
	enableExistingLinks: true,
	existingMatchMode: 'exact',
	existingOnSave: false,
	linkUnresolved: true,
	newNoteFolder: '',
	newFolderMode: 'subfolder',
};
