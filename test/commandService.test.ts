import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/settingsSchema.ts';
import type { AutoLinkSettings } from '../src/settingsSchema.ts';
import { linkTemplateKeywords, processFileAndPreview, processVaultAndPreview } from '../src/services/commandService.ts';
import type { IPlugin } from '../src/services/ipluginInterface.ts';
import type { Suggestion } from '../src/ui/suggestion.ts';

/** In-memory IPlugin: files map stands in for the vault. */
function fakePlugin(opts: {
	doc?: string;
	files?: Record<string, string>;
	settings?: Partial<AutoLinkSettings>;
	source?: string;
} = {}) {
	const files = new Map(Object.entries(opts.files ?? {}));
	const notices: string[] = [];
	const previews: Array<{
		suggestions: Suggestion[];
		onApply: (indices: number[]) => Promise<void>;
	}> = [];
	const plugin: IPlugin & {
		applyPreview: (indices: number[]) => Promise<void>;
		previewSuggestions: Suggestion[];
		notices: string[];
	} = {
		value: () => opts.doc ?? '',
		set: () => {},
		notice: (msg) => {
			notices.push(msg);
		},
		notices,
		settings: { ...DEFAULT_SETTINGS, ...opts.settings },
		folder: () => 'a',
		source: () => opts.source ?? '',
		markdownFiles: () =>
			[...files.keys()].map((path) => ({
				path,
				basename: path.split('/').pop()?.replace(/\.md$/, '') ?? '',
			})),
		getFiles: async () => [...files.keys()],
		getFileByPath: (p) => (files.has(p) ? ({ path: p } as never) : null),
		noteAliases: () => [],
		read: async (f) =>
			files.get(typeof f === 'string' ? f : f.path) ?? '',
		write: async (p, data) => {
			files.set(p, data);
		},
		modify: async (f, data) => {
			files.set(f.path, data);
		},
		create: async (p, data) => {
			if (files.has(p)) throw new Error('already exists');
			files.set(p, data);
			return { path: p, basename: p, parent: null } as never;
		},
		openFile: async () => {
			throw new Error('not implemented in fake');
		},
		undoableWriter: () => undefined,
		preview: (suggestions, onApply) => previews.push({ suggestions, onApply }),
		get applyPreview() {
			assert.equal(previews.length, 1, 'expected exactly one preview');
			return previews[0]!.onApply;
		},
		get previewSuggestions() {
			assert.equal(previews.length, 1, 'expected exactly one preview');
			return previews[0]!.suggestions;
		},
	};
	return plugin;
}

test('linkTemplateKeywords links template lines and notices count', () => {
	const plugin = fakePlugin({ doc: '- Cow - moo\nunrelated text' });
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};

	linkTemplateKeywords(plugin);

	assert.match(setWith, /\[\[Cow\]\]/);
	assert.ok(!setWith.includes('{{'));
	assert.deepEqual(plugin.notices, ['Linked 1 keyword(s).']);
});

test('linkTemplateKeywords quiet mode skips no-match notice', () => {
	const plugin = fakePlugin({ doc: 'nothing here' });
	linkTemplateKeywords(plugin, true);
	assert.deepEqual(plugin.notices, []);
});

test('processFileAndPreview creates note then links source', async () => {
	const plugin = fakePlugin({
		doc: '- Cow - moo',
		settings: { enableNlpKeywords: false },
		source: 'notes/daily.md',
	});
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};

	processFileAndPreview(plugin);

	const [s] = plugin.previewSuggestions;
	assert.equal(s?.sources?.[0], 'notes/daily.md:1');
	assert.match(s?.templates?.[0] ?? '', /\{\{Link Name\}\}/);
	assert.ok(!s?.nlpRoot, 'template-only suggestion has no nlp root');

	await plugin.applyPreview([0]);

	assert.ok(plugin.getFileByPath('a/Cow.md'), 'note created in file folder');
	assert.match(setWith, /\[\[Cow\]\]/);
	const last = plugin.notices.at(-1) ?? '';
	assert.match(last, /Created 1, appended 0\. Linked 1 keyword\(s\)\./);
});

test('nlp suggestions carry root form and source file', () => {
	const plugin = fakePlugin({
		doc: 'The cows grazed. The cows slept.',
		settings: { enableTemplateKeywords: false },
		source: 'notes/field.md',
	});

	processFileAndPreview(plugin);

	const [s] = plugin.previewSuggestions;
	assert.equal(s?.nlpRoot, 'cow');
	assert.deepEqual(s?.sources, ['notes/field.md']);
});

test('processFileAndPreview notices when nothing matches', () => {
	const plugin = fakePlugin({
		doc: 'plain text',
		settings: { enableNlpKeywords: false },
	});
	processFileAndPreview(plugin);
	assert.deepEqual(plugin.notices, ['No keyword matches found.']);
});

test('processVaultAndPreview resolves shared folder and links all files', async () => {
	const plugin = fakePlugin({
		files: {
			'a/one.md': '- Cow - moo',
			'a/two.md': '- Cows - many',
		},
		settings: { enableNlpKeywords: false },
	});

	await processVaultAndPreview(plugin);
	await plugin.applyPreview([0]);

	// Both references fold onto one note created in the common folder.
	const note = plugin.read('a/Cow.md');
	assert.ok(note, 'note created at closest common folder');
	assert.match(await note, /moo/);
	assert.match(await note, /many/);
	assert.match(await plugin.read('a/one.md'), /\[\[Cow\]\]/);
	assert.match(await plugin.read('a/two.md'), /\[\[Cow\|Cows\]\]/);
	assert.match(plugin.notices[0] ?? '', /Created 1, appended 0\. Linked \d+ keyword\(s\)\./);
});

test('preview apply links NLP keyword occurrences in the source doc', async () => {
	const plugin = fakePlugin({
		doc: 'The cows grazed. The cows slept.',
		settings: { enableTemplateKeywords: false },
	});
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};

	processFileAndPreview(plugin);
	await plugin.applyPreview([0]);

	assert.ok(plugin.getFileByPath('a/Cows.md'), 'note created');
	assert.match(setWith, /\[\[Cows\]\]/, 'source doc linked');
});

test('linkTemplateKeywords never touches frontmatter', () => {
	const doc = [
		'---',
		'modified:',
		'  - 2026-08-24T23:47:33-05:00',
		'created: 2026-08-22T21:02:29-05:00',
		'- --',
		'---',
		'- Armor Class - The damage threshold',
	].join('\n');
	const plugin = fakePlugin({ doc });
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};

	linkTemplateKeywords(plugin);

	assert.equal(setWith.split('\n').slice(0, 6).join('\n'), doc.split('\n').slice(0, 6).join('\n'));
	assert.match(setWith, /\[\[Armor Class\]\]/);
});

test('preview presents only template findings when configured', () => {
	const plugin = fakePlugin({
		doc: '- Cow - moo\nThe cows grazed. The cows slept.',
		settings: { previewKeywords: 'template' },
	});

	processFileAndPreview(plugin);

	assert.deepEqual(
		plugin.previewSuggestions.map((s) => s.name),
		['Cow'],
	);
});

test('preview presents only nlp findings when configured', () => {
	const plugin = fakePlugin({
		doc: '- Cow - moo\nThe cows grazed. The cows slept.',
		settings: { previewKeywords: 'nlp' },
	});

	processFileAndPreview(plugin);

	assert.deepEqual(plugin.previewSuggestions.map((s) => s.templates ?? []), [[]]);
	assert.ok(plugin.previewSuggestions.every((s) => s.nlpRoot));
});

test('vault scan marks nlpRoot only for nlp-contributed entries', async () => {
	const plugin = fakePlugin({
		files: {
			'a/one.md': '- Cow - moo\nThe cows grazed. The cows slept.',
			'a/two.md': '- Pig - oink',
		},
		settings: { existingMatchMode: 'exact' },
	});

	await processVaultAndPreview(plugin);

	const byName = new Map(plugin.previewSuggestions.map((s) => [s.name, s]));
	assert.ok(byName.get('Cow')?.nlpRoot, 'mixed finding keeps nlp root');
	assert.ok(!byName.get('Pig')?.nlpRoot, 'template-only finding has no nlp root');
});
