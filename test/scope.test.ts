import test from 'node:test';
import assert from 'node:assert/strict';
import { inScope, scopeFolderFor, dirOf, frontmatterNamespace, effectiveScope } from '../src/scope.ts';
import type { AutoLinkSettings } from '../src/settingsSchema.ts';

function settings(over: Partial<Pick<AutoLinkSettings, 'scope' | 'scopeFolder'>> = {}) {
	return { scope: 'vault', scopeFolder: '', ...over } as Pick<AutoLinkSettings, 'scope' | 'scopeFolder'>;
}

test('dirOf splits folder from file', () => {
	assert.equal(dirOf('a/b/Cow.md'), 'a/b');
	assert.equal(dirOf('Cow.md'), '');
	assert.equal(dirOf('a/'), 'a');
});

test('inScope: vault-wide always true', () => {
	const s = settings();
	assert.equal(inScope('Any/Where.md', s), true);
	assert.equal(inScope('Cow.md', s), true);
});

test('inScope: same-folder only matches the source folder', () => {
	const s = settings({ scope: 'same' });
	assert.equal(inScope('a/Cow.md', s, 'a'), true);
	assert.equal(inScope('a/b/Cow.md', s, 'a'), false);
	assert.equal(inScope('b/Cow.md', s, 'a'), false);
	// No active folder → nothing in scope.
	assert.equal(inScope('a/Cow.md', s, ''), false);
});

test('inScope: folder mode matches folder and subfolders only', () => {
	const s = settings({ scope: 'folder', scopeFolder: 'Projects/Agile' });
	assert.equal(inScope('Projects/Agile/Sprint.md', s), true);
	assert.equal(inScope('Projects/Agile/Backlog/Story.md', s), true);
	assert.equal(inScope('Projects/Sprint.md', s), false);
	assert.equal(inScope('Other/Sprint.md', s), false);
});

test('inScope: folder mode with blank folder is unrestricted', () => {
	const s = settings({ scope: 'folder', scopeFolder: '  ' });
	assert.equal(inScope('Any/Where.md', s), true);
});

test('scopeFolderFor returns the creation folder per scope', () => {
	assert.equal(scopeFolderFor(settings({ scope: 'vault' }), 'a'), '');
	assert.equal(scopeFolderFor(settings({ scope: 'folder', scopeFolder: '  Projects/Agile  ' }), 'a'), 'Projects/Agile');
	assert.equal(scopeFolderFor(settings({ scope: 'same' }), 'a/b'), 'a/b');
	assert.equal(scopeFolderFor(settings({ scope: 'same' }), ''), '');
});

test('frontmatterNamespace reads the note namespace folder', () => {
	assert.equal(frontmatterNamespace('---\nnamespace: team-a\n---\n\nBody'), 'team-a');
	assert.equal(frontmatterNamespace('---\nnamespace: "team a"\n---\nBody'), 'team a');
	assert.equal(frontmatterNamespace('---\nnothing here\n---\nBody'), '');
	assert.equal(frontmatterNamespace('plain body without frontmatter'), '');
	assert.equal(frontmatterNamespace(''), '');
	// List/object values are not a folder namespace.
	assert.equal(frontmatterNamespace('---\nnamespace:\n  - a\n---\n'), '');
});

test('effectiveScope: note namespace overrides the global scope', () => {
	const vault = settings({ scope: 'vault' });
	const folder = settings({ scope: 'folder', scopeFolder: 'Projects' });
	assert.deepEqual(effectiveScope(vault, 'team-a'), { scope: 'folder', scopeFolder: 'team-a' });
	// Blank namespace leaves the global scope untouched.
	assert.deepEqual(effectiveScope(folder, ''), folder);
	assert.deepEqual(effectiveScope(folder, '/team-a/'), { scope: 'folder', scopeFolder: 'team-a' });
});

test('effectiveScope: namespace drives inScope and scopeFolderFor', () => {
	const eff = effectiveScope(settings(), 'proj');
	assert.equal(inScope('proj/Cow.md', eff), true);
	assert.equal(inScope('proj/sub/Cow.md', eff), true);
	assert.equal(inScope('other/Cow.md', eff), false);
	assert.equal(scopeFolderFor(eff, 'a'), 'proj');
});
