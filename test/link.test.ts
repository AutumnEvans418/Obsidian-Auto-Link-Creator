import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wikiLink, markdownLink, encodePath } from '../src/link.ts';

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

test('encodePath keeps folder separators', () => {
	assert.equal(
		encodePath('Projects/Three laws of motion.md'),
		'Projects/Three%20laws%20of%20motion.md',
	);
});
