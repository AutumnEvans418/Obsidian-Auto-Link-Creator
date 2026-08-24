/** Obsidian-free settings schema: importable from unit tests. */
export interface AutoLinkSettings {
	/** Line patterns like `- {{Link Name}} ({{Link Alias}}) - {{Link Content}}`. First match wins. */
	templates: string[];
	/** Skip template/child-line matching inside fenced code blocks (```). */
	ignoreCodeblocks: boolean;
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
}

export const DEFAULT_SETTINGS: AutoLinkSettings = {
	templates: [
		'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
		'- {{Link Name}} ({{Link Alias}})',
		'- {{Link Name}} - {{Link Content}}',
	],
	ignoreCodeblocks: true,
	capitalize: true,
	enableTemplateKeywords: true,
	enableNlpKeywords: true,
	extraStopwords: '',
	openForUndo: true,
	onSaveEnabled: false,
};
