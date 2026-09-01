/**
 * Preview filter selections that survive reopening the modal. Kept in
 * `localStorage` (persists across sessions) plus an in-memory mirror so a
 * second preview in the same session starts where the first left off. Logic
 * is obsidian-free so it can be unit-tested.
 */
export type PreviewSort = 'usage' | 'name' | 'longest' | 'shortest';
export type PreviewFilterMode = 'both' | 'template' | 'nlp';

export interface PreviewPrefs {
	sortBy: PreviewSort;
	filterMode: PreviewFilterMode;
	onlyContent: boolean;
	useVault: boolean;
}

export const PREVIEW_PREFS_DEFAULTS: PreviewPrefs = {
	sortBy: 'usage',
	filterMode: 'both',
	onlyContent: false,
	useVault: false,
};

export const PREVIEW_PREFS_KEY = 'auto-link-creator.preview-prefs';

const SORTS = new Set<PreviewSort>(['usage', 'name', 'longest', 'shortest']);
const MODES = new Set<PreviewFilterMode>(['both', 'template', 'nlp']);

/** Parse an unknown saved value into a valid {@link PreviewPrefs}. */
export function parsePreviewPrefs(raw: unknown): PreviewPrefs {
	const src = (raw ?? {}) as Partial<Record<keyof PreviewPrefs, unknown>>;
	return {
		sortBy: SORTS.has(src.sortBy as PreviewSort) ? (src.sortBy as PreviewSort) : PREVIEW_PREFS_DEFAULTS.sortBy,
		filterMode: MODES.has(src.filterMode as PreviewFilterMode)
			? (src.filterMode as PreviewFilterMode)
			: PREVIEW_PREFS_DEFAULTS.filterMode,
		onlyContent: typeof src.onlyContent === 'boolean' ? src.onlyContent : PREVIEW_PREFS_DEFAULTS.onlyContent,
		useVault: typeof src.useVault === 'boolean' ? src.useVault : PREVIEW_PREFS_DEFAULTS.useVault,
	};
}

/** Read persisted prefs; returns defaults on any error/missing entry. */
export function loadPreviewPrefs(storage: Pick<Storage, 'getItem'>): PreviewPrefs {
	try {
		return parsePreviewPrefs(JSON.parse(storage.getItem(PREVIEW_PREFS_KEY) ?? 'null'));
	} catch {
		return { ...PREVIEW_PREFS_DEFAULTS };
	}
}

/** Persist prefs; swallows quota/availability errors. */
export function savePreviewPrefs(storage: Pick<Storage, 'setItem'>, prefs: PreviewPrefs): void {
	try {
		storage.setItem(PREVIEW_PREFS_KEY, JSON.stringify(prefs));
	} catch {
		// storage unavailable (e.g. private mode) — not worth surfacing.
	}
}
