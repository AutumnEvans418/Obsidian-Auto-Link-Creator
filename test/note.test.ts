import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeContent, noteBody } from '../src/note.ts';

test('body with aliases adds frontmatter', () => {
	assert.equal(
		noteBody({ name: 'Risk Appetite', alias: 'RA', content: 'level of risk' }),
		'---\naliases:\n  - RA\n---\nlevel of risk\n',
	);
	assert.equal(
		noteBody({ name: 'Risk Appetite', aliases: ['Risk Appetites'], content: 'x' }),
		'---\naliases:\n  - Risk Appetites\n---\nx\n',
	);
});

test('alias dedupes against aliases', () => {
	assert.equal(
		noteBody({ name: 'Risk Appetite', alias: 'X', aliases: ['X'] }),
		'---\naliases:\n  - X\n---\n',
	);
});

test('body without alias omits frontmatter', () => {
	assert.equal(
		noteBody({ name: 'Cows', content: 'plural' }),
		'plural\n',
	);
});

test('body without content is empty', () => {
	assert.equal(noteBody({ name: 'Empty' }), '');
});

test('mergeContent appends new content after blank line', () => {
	assert.equal(mergeContent('a\nb', 'c'), 'a\nb\n\nc');
});

test('mergeContent skips content already present as last block', () => {
	assert.equal(mergeContent('a\n\nhello', 'hello'), 'a\n\nhello');
	assert.equal(mergeContent('hello', 'hello'), 'hello');
});

test('mergeContent skips empty content and empty base', () => {
	assert.equal(mergeContent('a', ''), 'a');
	assert.equal(mergeContent('', 'x'), 'x');
});
