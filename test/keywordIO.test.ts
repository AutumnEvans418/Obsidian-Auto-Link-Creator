import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeKeywords, parseKeywords, serializeKeywords } from '../src/keywordIO.ts';

test('serialize produces a versioned JSON keyword array', () => {
	const json = serializeKeywords([
		{ name: 'Cow', aliases: ['cows'], content: 'moo' },
		{ name: 'Bovine', aliases: [] },
	]);
	const parsed = JSON.parse(json) as { version: number; keywords: unknown[] };
	assert.equal(parsed.version, 1);
	assert.equal(parsed.keywords.length, 2);
	assert.deepEqual(parsed.keywords[0], { name: 'Cow', aliases: ['cows'], content: 'moo' });
});

test('dedupeKeywords merges case-variant records keeping fuller aliases/content', () => {
	const merged = dedupeKeywords([
		{ name: 'Cow', aliases: ['cows'] },
		{ name: 'cow', aliases: ['bovine'], content: 'moo' },
	]);
	assert.equal(merged.length, 1);
	assert.equal(merged[0]?.name, 'Cow');
	assert.ok(merged[0]?.aliases.includes('cows'));
	assert.ok(merged[0]?.aliases.includes('bovine'));
	assert.equal(merged[0]?.content, 'moo');
});

test('parseKeywords round-trips a serialized file', () => {
	const json = serializeKeywords([{ name: 'Cow', aliases: ['cows'], content: 'moo' }]);
	const { records, error } = parseKeywords(json);
	assert.equal(error, undefined);
	assert.deepEqual(records, [{ name: 'Cow', aliases: ['cows'], content: 'moo' }]);
});

test('parseKeywords reports an error on invalid JSON', () => {
	const { records, error } = parseKeywords('not json {');
	assert.deepEqual(records, []);
	assert.ok(error, 'error is set');
});

test('parseKeywords drops malformed entries and empty aliases', () => {
	const { records } = parseKeywords(
		JSON.stringify({
			version: 1,
			keywords: [
				{ name: '  Cow  ', aliases: ['cows', '  ', 42] },
				{ name: '' },
				{ name: '  ', content: 'x' },
				{ name: null },
				{ name: 'Pig', aliases: [] },
			],
		}),
	);
	assert.deepEqual(records, [
		{ name: 'Cow', aliases: ['cows'] },
		{ name: 'Pig', aliases: [] },
	]);
});
