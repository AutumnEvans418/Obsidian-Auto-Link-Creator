import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	matchTemplate,
	findAllTemplate,
	findAllByTemplates,
	compileTemplate,
	groupByReference,
	groupContent,
} from '../src/template.ts';

const INLINE = '- {{Link Name}} ({{Link Alias}}) - {{Link Content}}';
const NESTED = '- {{Link Name}} ({{Link Alias}})\n  - {{Link Content}}';

test('matches inline template with alias and content', () => {
	const r = matchTemplate('- Risk Appetite - Level of risk accepted', INLINE);
	assert.equal(r?.name, 'Risk Appetite');
	assert.equal(r?.alias, undefined);
	assert.equal(r?.content, 'Level of risk accepted');
});

test('matches nested children as content', () => {
	const r = matchTemplate(
		'- Access control systems (ACS)\n  - Identification\n  - Authentication',
		NESTED,
	);
	assert.equal(r?.name, 'Access control systems');
	assert.equal(r?.alias, 'ACS');
	assert.equal(r?.content, 'Identification\nAuthentication');
});

test('uppercases nothing - alias separate from name', () => {
	const r = matchTemplate('- Foo (Bar) - baz content', INLINE);
	assert.equal(r?.name, 'Foo');
	assert.equal(r?.alias, 'Bar');
	assert.equal(r?.content, 'baz content');
});

test('null on template without Link Name', () => {
	assert.equal(compileTemplate('- {{Link Content}}'), null);
});

test('null when no line matches', () => {
	assert.equal(matchTemplate('# just a heading', INLINE), null);
});

test('finds all matches in document order', () => {
	const doc = [
		'- Test2 (alias32)',
		'\t- content1',
		'\t- content2',
		'- test3 (alias) - content',
	].join('\n');
	const all = findAllTemplate(doc, NESTED);
	assert.equal(all.length, 2);
	assert.equal(all[0]?.name, 'Test2');
	assert.equal(all[0]?.alias, 'alias32');
	assert.equal(all[0]?.content, 'content1\ncontent2');
	assert.equal(all[1]?.name, 'test3');
	assert.equal(all[1]?.content, 'content');
});

test('inline content survives when a child-content template wins first', () => {
	const tpls = [
		'- {{Link Name}} ({{Link Alias}})\n  - {{Link Content}}',
		'- {{Link Name}} ({{Link Alias}})',
		'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
		'- {{Link Name}} - {{Link Content}}',
	];
	const all = findAllByTemplates(
		['- Risk Appetite - Level of risk accepted.',
		 '- Access control systems (ACS) - Controls who enters.',
		 '- Risk Appetites - level of risk'].join('\n'),
		tpls,
	);
	const risk = all.find((h) => h.name === 'Risk Appetite');
	assert.equal(risk?.content, 'Level of risk accepted.');
	const access = all.find((h) => h.name === 'Access control systems');
	assert.equal(access?.content, 'Controls who enters.');
	assert.equal(access?.alias, 'ACS');
});

test('groupContent concatenates variant contents in order, deduped', () => {
	const out = groupContent([
		{ name: 'Risk Appetite', content: 'Level of risk accepted.', lineIndex: 0 },
		{ name: 'Risk Appetites', content: 'level of risk', lineIndex: 2 },
		{ name: 'Risk Appetite', content: 'level of risk', lineIndex: 4 },
	]);
	assert.equal(out, 'Level of risk accepted.\n\nlevel of risk');
	assert.equal(groupContent([{ name: 'X', lineIndex: 0 }]), undefined);
});

test('rejects blank name line (empty draft)', () => {
	assert.equal(matchTemplate('- ', '- {{Link Name}} - {{Link Content}}'), null);
});

test('rejects names without any letter (e.g. `--` from frontmatter lists)', () => {
	assert.equal(matchTemplate('- --', '- {{Link Name}}'), null);
	assert.ok(matchTemplate('- 123', '- {{Link Name}}', { ignoreDates: false }));
	assert.equal(matchTemplate('- 123', '- {{Link Name}}'), null);
	assert.ok(matchTemplate('- Cow', '- {{Link Name}}'));
});

test('skips YAML frontmatter block entirely', () => {
	const doc = [
		'---',
		'modified:',
		'  - 2026-08-24T23:47:33-05:00',
		'created: 2026-08-22T21:02:29-05:00',
		'- --',
		'---',
		'- Real (yes) - is a hit',
	].join('\n');
	const all = findAllByTemplates(doc, DEFAULTS, { ignoreDates: true });
	assert.equal(all.length, 1);
	assert.equal(all[0]?.name, 'Real');
});

test('ignoreDates drops date-like names; off keeps them', () => {
	const doc = '- 2026-08-24 - a date\n- Cow - an animal';
	assert.equal(findAllByTemplates(doc, DEFAULTS, { ignoreDates: true }).length, 1);
	const all = findAllByTemplates(doc, DEFAULTS, { ignoreDates: false });
	assert.equal(all.length, 2);
	// Lazy capture stops the name at the first `-` separator.
	assert.equal(all[0]?.name, '2026');
});

test('ignores template lines inside fenced code block by default', () => {
	const doc = ['Intro text', '```', '- Fake (no) - not a real hit', '```', '- Real (yes) - is a hit'].join('\n');
	const all = findAllTemplate(doc, INLINE);
	assert.equal(all.length, 1);
	assert.equal(all[0]?.name, 'Real');
});

test('matches inside code block when ignoreCodeblocks=false', () => {
	const doc = ['```', '- Fake (no) - should match', '```'].join('\n');
	const all = findAllTemplate(doc, INLINE, { ignoreCodeblocks: false });
	assert.equal(all.length, 1);
	assert.equal(all[0]?.name, 'Fake');
});

const DEFAULTS = [
	'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
	'- {{Link Name}} ({{Link Alias}})',
	'- {{Link Name}} - {{Link Content}}',
];

const PREVIEW = [
	'- Test2 (alias32)',
	'\t- content1',
	'\t- content2',
	'- test3 (alias) - content',
	'- Risk Appetite - Level of risk accepted.',
	'- Access control systems (ACS) - Controls who enters.',
	'- ',
	'just prose',
].join('\n');

test('first-matching-template per line; 4 hits in fixture', () => {
	const all = findAllByTemplates(PREVIEW, DEFAULTS);
	assert.equal(all.length, 4);
	// Template order: name+alias+content wins before the loose name-only form,
	// so sibling lines (content1) are not lifted into standalone notes.
	const names = all.map((h) => h.name);
	assert.deepEqual(names, [
		'Test2',
		'test3',
		'Risk Appetite',
		'Access control systems',
	]);
	assert.equal(all[0]?.alias, 'alias32');
	assert.equal(all[0]?.content, 'content1\ncontent2');
	assert.equal(all[1]?.alias, 'alias');
	assert.equal(all[1]?.content, 'content');
	assert.equal(all[2]?.content, 'Level of risk accepted.');
	assert.equal(all[3]?.alias, 'ACS');
	assert.equal(all[3]?.content, 'Controls who enters.');
});

test('groupByReference merges variant forms into one note', () => {
	const hits = findAllByTemplates(
		[
			'- Risk Appetite - Level of risk accepted.',
			'- Risk Appetites - level of risk',
			'- Access control systems (ACS) - Controls who enters.',
		].join('\n'),
		DEFAULTS,
	);
	const groups = groupByReference(hits);
	assert.equal(groups.length, 2);
	const appetite = groups.find((g) => g[0]?.name.toLowerCase().startsWith('risk'));
	const acs = groups.find((g) => g[0]?.name.toLowerCase().startsWith('access'));
	assert.equal(appetite?.length, 2);
	assert.equal(acs?.length, 1);
});
