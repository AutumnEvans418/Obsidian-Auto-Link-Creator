import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closestCommonFolder, resolveTargetFolder } from '../src/folders.ts';

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

test('resolveTargetFolder blank name keeps base', () => {
	assert.equal(resolveTargetFolder('a/b', '', 'subfolder', () => true), 'a/b');
});

test('resolveTargetFolder subfolder appends to base', () => {
	const never = () => {
		throw new Error('should not check existence');
	};
	assert.equal(resolveTargetFolder('a/b', 'Concepts', 'subfolder', never), 'a/b/Concepts');
	assert.equal(resolveTargetFolder('', 'Concepts', 'subfolder', never), 'Concepts');
});

test('resolveTargetFolder closest finds deepest match walking up', () => {
	// Only the root-level Concepts exists.
	const exists = (p: string) => p === 'Concepts';
	assert.equal(resolveTargetFolder('a/b/c', 'Concepts', 'closest', exists), 'Concepts');
	// Deepest existing wins.
	const deep = (p: string) => p === 'a/b/Concepts';
	assert.equal(resolveTargetFolder('a/b/c', 'Concepts', 'closest', deep), 'a/b/Concepts');
});

test('resolveTargetFolder closest returns null when nothing matches', () => {
	assert.equal(
		resolveTargetFolder('a/b', 'Missing', 'closest', () => false),
		null,
	);
});
