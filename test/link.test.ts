import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wikiLink, markdownLink, encodePath, applyLinks } from '../src/link.ts';
import { wikiSpans, overlapsExistingLink } from '../src/linkDetector.ts';
import { findAllByTemplates } from '../src/template.ts';

test('wiki link without alias', () => {
	assert.equal(wikiLink({ name: 'Risk Appetite' }), '[[Risk Appetite]]');
});

test('wiki link with alias', () => {
	assert.equal(
		wikiLink({ name: 'Access Control Systems', alias: 'ACS' }),
		'[[Access Control Systems|ACS]]',
	);
});

test('markdown link uses name when no alias', () => {
	assert.equal(
		markdownLink({ name: 'Risk Appetite' }, 'Risk Appetite.md'),
		'[Risk Appetite](Risk%20Appetite.md)',
	);
});

test('markdown link uses alias as text', () => {
	assert.equal(
		markdownLink({ name: 'Access Control Systems', alias: 'ACS' }, 'ACS.md'),
		'[ACS](ACS.md)',
	);
});

test('capitalize flag off preserves raw casing', () => {
	assert.equal(wikiLink({ name: 'access control', alias: 'ACS' }, false), '[[access control|ACS]]');
});

test('encodePath keeps folder separators', () => {
	assert.equal(
		encodePath('Projects/Three laws of motion.md'),
		'Projects/Three%20laws%20of%20motion.md',
	);
});

test('wikiSpans finds [[...]] spans with inclusive ends', () => {
	assert.deepEqual(wikiSpans('see [[Risk Appetite]] here'), [
		{ start: 4, end: 21 },
	]);
	assert.deepEqual(wikiSpans('a [[X|y]] b [[Z]]'), [
		{ start: 2, end: 9 },
		{ start: 12, end: 17 },
	]);
	assert.deepEqual(wikiSpans('no links'), []);
});

test('overlapsExistingLink true when phrase overlaps a span', () => {
	// phrase is the whole span
	assert.equal(
		overlapsExistingLink('- [[Risk Appetite]]', '- '.length, '- '.length + '[[Risk Appetite]]'.length),
		true,
	);
	// phrase is only the tail of a span
	assert.equal(overlapsExistingLink('[[Foo]]', 0, 5), true);
});

test('overlapsExistingLink false when phrase is disjoint from spans', () => {
	// phrase sits before the link
	assert.equal(overlapsExistingLink('Food - [[Risk]]', 0, 4), false);
	// phrase sits after the link
	assert.equal(overlapsExistingLink('[[Risk]] - Food', '[[Risk]] - '.length, '[[Risk]] - Food'.length), false);
	// no span at all
	assert.equal(overlapsExistingLink('plain prose', 0, 4), false);
});

const TEMPLATES = [
	'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
	'- {{Link Name}} ({{Link Alias}})',
	'- {{Link Name}} - {{Link Content}}',
];

test('running the pipeline twice is a no-op the second time', () => {
	const doc = [
		'- Foo (F) - first content',
		'- Bar - second content',
		'- Baz (baz) - third',
	].join('\n');

	const pass1 = findAllByTemplates(doc, TEMPLATES);
	assert.equal(pass1.length, 3);
	const linked = applyLinks(doc, pass1, true);

	// Second pass: every linked line is skipped by the link detector.
	const pass2 = findAllByTemplates(linked, TEMPLATES);
	assert.equal(pass2.length, 0);
	assert.equal(applyLinks(linked, pass2, true), linked, 'second apply is a no-op');
});
