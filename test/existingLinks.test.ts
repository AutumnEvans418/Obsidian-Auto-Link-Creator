import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyExistingLinks, buildNoteIndex } from '../src/existingLinks.ts';

const entries = [
	{ path: 'a/Cow.md', basename: 'Cow', aliases: ['Bovine'] },
	{ path: 'b/Risk Appetite.md', basename: 'Risk Appetite', aliases: [] },
];

test('exact index maps lowercased names and aliases', () => {
	const idx = buildNoteIndex(entries, 'exact');
	assert.equal(idx.get('cow'), 'Cow');
	assert.equal(idx.get('bovine'), 'Cow');
	assert.equal(idx.get('risk appetite'), 'Risk Appetite');
	assert.equal(idx.get('cows'), undefined, 'exact mode has no variants');
});

test('root index adds variant forms', () => {
	const idx = buildNoteIndex(entries, 'root');
	assert.equal(idx.get('cow'), 'Cow');
	assert.equal(idx.get('cows'), 'Cow');
});

test('replaces plain occurrence, keeps surface as alias', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const res = applyExistingLinks(doc(), idx, { capitalize: false });
	assert.match(res.updated, /^a \[\[Cow\]\] eats grass/);
	assert.equal(res.count, 1);
});
function doc(): string {
	return 'a cow eats grass\nsee [[Cow]] already linked';
}

test('skips matches inside wiki links (idempotent)', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const once = applyExistingLinks(doc(), idx, { capitalize: false });
	const twice = applyExistingLinks(once.updated, idx, { capitalize: false });
	assert.equal(twice.count, 0);
	assert.equal(twice.updated, once.updated);
});

test('capitalization rules apply when enabled', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const res = applyExistingLinks('the cow is here', idx, { capitalize: true });
	assert.match(res.updated, /the \[\[Cow\]\] is here/);
});

test('surface equal to note name becomes bare link', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const res = applyExistingLinks('Cow grazes', idx, { capitalize: true });
	assert.match(res.updated, /^\[\[Cow\]\] grazes$/);
});

test('root mode links plural surface to singular note', () => {
	const idx = buildNoteIndex(entries, 'root');
	const res = applyExistingLinks('three cows graze', idx, { capitalize: true });
	assert.match(res.updated, /three \[\[Cow\|Cows\]\] graze/);
});

test('skips fenced code blocks and frontmatter', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const doc = '---\naliases: [Cow]\n---\n```\ncow\n```\ntalk about cow here';
	const res = applyExistingLinks(doc, idx, { capitalize: false });
	const body = res.updated.split('\n').at(-1) ?? '';
	assert.match(body, /talk about \[\[Cow\]\] here/);
	assert.match(res.updated, /^---\naliases: \[Cow\]\n---/);
	assert.match(res.updated, /```\ncow\n```/);
	assert.equal(res.count, 1);
});

test('excludeBasename avoids self-links', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const res = applyExistingLinks('Cow says moo', idx, {
		capitalize: false,
		excludeBasename: 'Cow',
	});
	assert.equal(res.count, 0);
	assert.equal(res.updated, 'Cow says moo');
});

test('longer key wins over shorter overlapping key', () => {
	const entries2 = [
		{ path: 'a/Risk.md', basename: 'Risk', aliases: [] },
		{ path: 'b/Risk Appetite.md', basename: 'Risk Appetite', aliases: [] },
	];
	const idx = buildNoteIndex(entries2, 'exact');
	const res = applyExistingLinks('our risk appetite grows', idx, { capitalize: false });
	assert.match(res.updated, /our \[\[Risk Appetite\]\] grows/);
	assert.equal(res.count, 1);
});
