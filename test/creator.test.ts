import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNote } from '../src/creator.ts';
import { noteBody } from '../src/note.ts';
import { DEFAULT_SETTINGS } from '../src/settingsSchema.ts';
import type { AutoLinkSettings } from '../src/settingsSchema.ts';
import type { IPlugin } from '../src/services/ipluginInterface.ts';

/** Minimal in-memory IPlugin for createNote. */
function fakePlugin(files: Record<string, string> = {}) {
	const store = new Map(Object.entries(files));
	const plugin: IPlugin = {
		value: () => '',
		set: () => {},
		notice: () => {},
		settings: DEFAULT_SETTINGS as AutoLinkSettings,
		source: () => '',
		folder: () => '',
		markdownFiles: () =>
			[...store.keys()].map((path) => ({
				path,
				basename: path.split('/').pop()?.replace(/\.md$/, '') ?? '',
			})),
		getFiles: async () => [...store.keys()],
		getFileByPath: (p) => (store.has(p) ? ({ path: p } as never) : null),
		noteAliases: () => [],
		unresolvedLinks: () => [],
		read: async (f) => store.get(typeof f === 'string' ? f : f.path) ?? '',
		write: async (p, data) => {
			store.set(p, data);
		},
		modify: async (f, data) => {
			store.set(f.path, data);
		},
		create: async (p, data) => {
			if (store.has(p)) throw new Error('already exists');
			store.set(p, data);
			return { path: p } as never;
		},
		openFile: async () => {
			throw new Error('not expected in createNote tests');
		},
		undoableWriter: () => undefined,
		preview: () => {},
	};
	return plugin;
}

test('createNote calls onWrite for a new note', async () => {
	const plugin = fakePlugin();
	const written: Array<[string, string]> = [];
	await createNote(plugin, 'concepts', { name: 'Risk Appetite', content: 'level of risk' }, true, async (p, c) => {
		written.push([p, c]);
	});
	assert.equal(written.length, 1, 'onWrite invoked for created note');
	assert.equal(written[0]?.[0], 'concepts/Risk Appetite.md');
	assert.equal(written[0]?.[1], noteBody({ name: 'Risk Appetite', content: 'level of risk' }));
});

test('createNote calls onWrite for an appended note', async () => {
	const plugin = fakePlugin({ 'concepts/Risk Appetite.md': 'old content' });
	const written: Array<[string, string]> = [];
	await createNote(plugin, 'concepts', { name: 'Risk Appetite', content: 'new content' }, true, async (p, c) => {
		written.push([p, c]);
	});
	assert.equal(written.length, 1, 'onWrite invoked for appended note');
	assert.equal(written[0]?.[0], 'concepts/Risk Appetite.md');
	assert.match(written[0]?.[1] ?? '', /new content/);
});

test('createNote dedupes an identical append (mergeContent short-circuit)', async () => {
	const plugin = fakePlugin({ 'concepts/Note.md': 'plain\n\nblock' });
	const written: Array<[string, string]> = [];
	await createNote(plugin, 'concepts', { name: 'Note', content: 'block' }, true, async (p, c) => {
		written.push([p, c]);
	});
	assert.equal(written.length, 1, 'onWrite still fired for the open-for-undo tab');
	assert.equal(written[0]?.[1], 'plain\n\nblock', 'content unchanged');
});