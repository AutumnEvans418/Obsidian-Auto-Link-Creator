import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	PREVIEW_PREFS_DEFAULTS,
	loadPreviewPrefs,
	parsePreviewPrefs,
	savePreviewPrefs,
	PREVIEW_PREFS_KEY,
} from '../src/previewPrefs.ts';

test('parsePreviewPrefs fills defaults from empty input', () => {
	assert.deepEqual(parsePreviewPrefs(null), PREVIEW_PREFS_DEFAULTS);
	assert.deepEqual(parsePreviewPrefs({}), PREVIEW_PREFS_DEFAULTS);
});

test('parsePreviewPrefs drops invalid enum values to defaults', () => {
	const p = parsePreviewPrefs({ sortBy: 'bogus', filterMode: 42, onlyContent: 'yes', useVault: 1 });
	assert.equal(p.sortBy, 'usage');
	assert.equal(p.filterMode, 'both');
	assert.equal(p.onlyContent, false);
	assert.equal(p.useVault, false);
});

test('parsePreviewPrefs keeps valid values', () => {
	const p = parsePreviewPrefs({ sortBy: 'name', filterMode: 'nlp', onlyContent: true, useVault: true });
	assert.deepEqual(p, { sortBy: 'name', filterMode: 'nlp', onlyContent: true, useVault: true });
});

test('save then load round-trips through storage', () => {
	const store = new Map<string, string>();
	const storage = {
		getItem: (k: string): string | null => store.get(k) ?? null,
		setItem: (k: string, v: string): void => void store.set(k, v),
	};
	const prefs = { sortBy: 'longest' as const, filterMode: 'template' as const, onlyContent: true, useVault: false };
	savePreviewPrefs(storage, prefs);
	assert.ok(store.has(PREVIEW_PREFS_KEY));
	assert.deepEqual(loadPreviewPrefs(storage), prefs);
});

test('loadPreviewPrefs returns defaults on corrupt JSON', () => {
	const storage = { getItem: (): string | null => '{not json' };
	assert.deepEqual(loadPreviewPrefs(storage), PREVIEW_PREFS_DEFAULTS);
});
