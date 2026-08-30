import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyExistingLinks, buildNoteIndex, foldHitTargets } from '../src/existingLinks.ts';

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

test('escapes alias pipe inside a table row so the table is intact', () => {
	const idx = buildNoteIndex([{ path: 't/Threat Source.md', basename: 'Threat Source', aliases: [] }], 'root');
	const doc = '| Threat Sources | Ratings |';
	const res = applyExistingLinks(doc, idx, { capitalize: true });
	assert.equal(res.updated, '| [[Threat Source\\|Threat Sources]] | Ratings |');
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

test('skips a language-tagged code block by default', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const res = applyExistingLinks('```mermaid\ncow\n```', idx, { capitalize: false });
	assert.equal(res.count, 0);
});

test('allowlisted code block language still gets existing-note links', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const doc = ['```mermaid', 'Alice->>cow: grass', '```'].join('\n');
	const res = applyExistingLinks(doc, idx, { capitalize: true, allowedCodeblocks: ['mermaid'] });
	assert.equal(res.count, 1);
	assert.match(res.updated, /Alice->>\[\[Cow\]\]: grass/);
});

test('non-allowlisted block stays skipped alongside an allowlisted one', () => {
	const idx = buildNoteIndex(entries, 'exact');
	const doc = ['```text', 'cow here', '```', '```mermaid', 'cow there', '```'].join('\n');
	const res = applyExistingLinks(doc, idx, { capitalize: false, allowedCodeblocks: ['mermaid'] });
	assert.equal(res.count, 1);
	const lines = res.updated.split('\n');
	assert.equal(lines[1], 'cow here', 'text block untouched');
	assert.match(lines[4] ?? '', /\[\[Cow\]\] there/);
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

test('Information Assets matches longer note, not shorter Information', () => {
	const info = [
		{ path: 'notes/Information.md', basename: 'Information', aliases: [] },
		{ path: 'notes/Information Assets.md', basename: 'Information Assets', aliases: [] },
	];
	const idx = buildNoteIndex(info, 'exact');
	const res = applyExistingLinks('Information Assets are critical', idx, { capitalize: false });
	assert.match(res.updated, /\[\[Information Assets\]\] are critical/);
	assert.equal(res.count, 1);
});

test('foldHitTargets folds variant names onto existing notes', () => {
	const idx = buildNoteIndex(entries, 'root');
	const hits = [
		{ name: 'Armor Class', alias: undefined, content: undefined, lineIndex: 0, template: '' },
		{ name: 'Armor Classes', alias: undefined, content: undefined, lineIndex: 1, template: '' },
		{ name: 'Risk Appetites', alias: undefined, content: undefined, lineIndex: 2, template: '' },
	] as Parameters<typeof foldHitTargets>[0];
	foldHitTargets(hits, idx);
	assert.equal(hits[1]?.target, undefined); // not in this index
	const cowIdx = buildNoteIndex(
		[entries[0]!, { path: 'c/Armor Class.md', basename: 'Armor Class', aliases: [] }],
		'root',
	);
	foldHitTargets(hits, cowIdx);
	assert.equal(hits[0]?.target, undefined); // self-reference stays unfolded
	assert.equal(hits[1]?.target, 'Armor Class'); // plural folds onto singular
});

test('foldHitTargets respects exact mode (no variant folding)', () => {
	const idx = buildNoteIndex([entries[0]!], 'exact');
	const hits = [
		{ name: 'Cows', alias: undefined, content: undefined, lineIndex: 0, template: '' },
	] as Parameters<typeof foldHitTargets>[0];
	foldHitTargets(hits, idx, 'exact');
	assert.equal(hits[0]?.target, undefined);
});

test('buildNoteIndex with currentPath prefers closest note', () => {
	const dupes = [
		{ path: 'x/Cow.md', basename: 'Far Cow', aliases: ['Cow'] },
		{ path: 'same/dir/Cow.md', basename: 'Near Cow', aliases: ['Cow'] },
		{ path: 'same/dir/other/Cow.md', basename: 'Mid Cow', aliases: ['Cow'] },
	];
	const idx = buildNoteIndex(dupes, 'exact', 'same/dir/note.md');
	// same/dir/Cow.md and same/dir/other/Cow.md share prefix depth 2 with same/dir/.
	// Alphabetical tiebreak: same/dir/Cow.md < same/dir/other/Cow.md → Near Cow wins.
	assert.equal(idx.get('cow'), 'Near Cow');
});

test('buildNoteIndex without currentPath falls back to alphabetical', () => {
	const dupes = [
		{ path: 'z/Cow.md', basename: 'Z Cow', aliases: ['Cow'] },
		{ path: 'a/Cow.md', basename: 'A Cow', aliases: ['Cow'] },
	];
	const idx = buildNoteIndex(dupes, 'exact');
	// Alphabetical: a/Cow.md < z/Cow.md → A Cow wins.
	assert.equal(idx.get('cow'), 'A Cow');
});
