import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closestCommonFolder } from '../src/folders.ts';

test('single file → its own folder', () => {
	assert.equal(closestCommonFolder(['a/b/note.md']), 'a/b');
});

test('files sharing a folder → that folder', () => {
	assert.equal(closestCommonFolder(['a/b/x.md', 'a/b/y.md']), 'a/b');
});

test('files sharing a deep common ancestor → the closest', () => {
	assert.equal(closestCommonFolder(['a/b/c/x.md', 'a/b/d/y.md']), 'a/b');
});

test('root-level files share vault root → empty string', () => {
	assert.equal(closestCommonFolder(['note.md', 'other.md']), '');
});

test('no common folder → empty string', () => {
	assert.equal(closestCommonFolder(['a/b/x.md', 'c/d/y.md']), '');
});

test('empty input → empty string', () => {
	assert.equal(closestCommonFolder([]), '');
});
