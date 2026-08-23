import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteBody } from '../src/note.ts';

test('body with alias adds frontmatter', () => {
	assert.equal(
		noteBody({ name: 'Risk Appetite', alias: 'RA', content: 'level of risk' }),
		'---\naliases: [RA]\n---\nlevel of risk\n',
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
