import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/settingsSchema.ts';
import type { AutoLinkSettings } from '../src/settingsSchema.ts';
import { linkExistingNotes, linkTemplateKeywords, processFileAndPreview, processVaultAndPreview, exportKeywordFile, importKeywordFile } from '../src/services/commandService.ts';
import type { IPlugin } from '../src/services/ipluginInterface.ts';
import type { Suggestion } from '../src/ui/suggestion.ts';
import { ngramsFor } from '../src/keywords.ts';
import { vaultSuggestions, type CachedFile } from '../src/vaultNlpCache.ts';

/** In-memory IPlugin: files map stands in for the vault. */
function fakePlugin(opts: {
	doc?: string;
	files?: Record<string, string>;
	settings?: Partial<AutoLinkSettings>;
	source?: string;
	folders?: string[];
	promptFolder?: (def: string) => Promise<string | null>;
	unresolved?: string[];
} = {}) {
	const files = new Map(Object.entries(opts.files ?? {}));
	let cache = new Map<string, CachedFile>();
	const notices: string[] = [];
	const previews: Array<{
		suggestions: Suggestion[];
		secondary?: { label: string; load: () => Promise<Suggestion[]> };
		onApply: (indices: number[], listIndex?: number) => Promise<void>;
	}> = [];
	const plugin: IPlugin & {
		applyPreview: (indices: number[], listIndex?: number) => Promise<void>;
		previewSuggestions: Suggestion[];
		secondary?: { label: string; load: () => Promise<Suggestion[]> };
		notices: string[];
		files: Map<string, string>;
		cache: Map<string, CachedFile>;
	} = {
		value: () => opts.doc ?? '',
		set: () => {},
		notice: (msg) => {
			notices.push(msg);
		},
		notices,
		settings: { ...DEFAULT_SETTINGS, ...opts.settings },
		ensureVaultCache: async () => {
			// Populate a scratch per-file n-gram cache from the in-memory files,
			// mirroring the real reconciler's cache build for this opts set.
			const opts2 = { extraStopwords: plugin.settings.extraStopwords.split(',').map((s) => s.trim()).filter(Boolean) };
			cache = new Map<string, CachedFile>(
				[...files.entries()].map(([p, text]) => [
					p,
					{ mtime: 0, optsKey: '', ngrams: ngramsFor(text, opts2) },
				]),
			);
		},
		getVaultCache: () => cache,
		vaultContextSuggestions: (source, doc, options) => {
			// No shared cache field; build a scratch cache of every other file
			// (merged with the live doc, matching real per-file cache semantics).
			const c = new Map<string, CachedFile>(
				[...files.entries()]
					.filter(([p]) => p !== source)
					.map(([p, text]) => [
						p,
						{ mtime: 0, optsKey: '', ngrams: ngramsFor(text, options) },
					]),
			);
			return vaultSuggestions(c, source, doc, options);
		},
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
		unresolvedLinks: () => opts.unresolved ?? [],
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
		folderExists: opts.folders ? (p) => opts.folders!.includes(p) : undefined,
		promptFolder: opts.promptFolder,
		openFile: async () => {
			throw new Error('not implemented in fake');
		},
		undoableWriter: () => undefined,
		preview: (suggestions, onApply, secondary) =>
			previews.push({ suggestions, onApply, secondary }),
		files,
		cache,
		get applyPreview() {
			assert.equal(previews.length, 1, 'expected exactly one preview');
			return previews[0]!.onApply;
		},
		get previewSuggestions() {
			assert.equal(previews.length, 1, 'expected exactly one preview');
			return previews[0]!.suggestions;
		},
		get secondary() {
			assert.equal(previews.length, 1, 'expected exactly one preview');
			return previews[0]!.secondary;
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

test('linkTemplateKeywords skips the doc when frontmatter disables auto-link', () => {
	const plugin = fakePlugin({ doc: '---\nauto-link: false\n---\n- Cow - moo' });
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};

	linkTemplateKeywords(plugin);

	assert.equal(setWith, '');
	assert.deepEqual(plugin.notices, []);
});

test('linkExistingNotes skips the doc when frontmatter disables auto-link', () => {
	const plugin = fakePlugin({
		doc: '---\nauto-link: false\n---\ncow grazes',
		files: { 'Cow.md': 'the cow' },
	});
	linkExistingNotes(plugin);
	assert.deepEqual(plugin.notices, []);
});

test('linkExistingNotes honors ignoreHtml setting', () => {
	const plugin = fakePlugin({
		doc: '<div>cow grazes</div>',
		files: { 'Cow.md': 'the cow' },
		settings: { ignoreHtml: true },
	});
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};
	linkExistingNotes(plugin);
	assert.equal(setWith, '');
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

	await processFileAndPreview(plugin);

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

test('nlp suggestions carry root form and source file', async () => {
	const plugin = fakePlugin({
		doc: 'The cows grazed. The cows slept.',
		settings: { enableTemplateKeywords: false },
		source: 'notes/field.md',
	});

	await processFileAndPreview(plugin);

	const [s] = plugin.previewSuggestions;
	assert.equal(s?.nlpRoot, 'cow');
	assert.deepEqual(s?.sources, ['notes/field.md']);
});

test('preview dedupes case-variant keywords (Alias Support === alias support)', async () => {
	// Template and NLP both surface the same phrase with different casing; the
	// preview must show it once, matching apply-time dedupe behavior.
	const plugin = fakePlugin({
		doc: '- Alias Support - definition\n\nalias support appears here and again alias support',
		source: 'notes/daily.md',
	});

	await processFileAndPreview(plugin);

	const names = plugin.previewSuggestions.map((s) => s.name);
	const aliasSupport = names.filter((n) => n === 'Alias Support');
	assert.equal(aliasSupport.length, 1, `expected one "Alias Support", got ${JSON.stringify(names)}`);
});

test('processFileAndPreview notices when nothing matches', async () => {
	const plugin = fakePlugin({
		doc: 'plain text',
		settings: { enableNlpKeywords: false },
	});
	await processFileAndPreview(plugin);
	assert.deepEqual(plugin.notices, ['No keyword matches found.']);
});

test('preview ranks clustered occurrences above scattered ones', async () => {
	// Cow's three template occurrences sit on adjacent lines (clustered); Pig's
	// three are spread widely. Both are kept, but the preview leads with Cow.
	const plugin = fakePlugin({
		doc: '- Cow - moo\n- Cow - moo\n- Cow - moo\n- Pig - oink\n\n\n\n\n\n\n\n\n- Pig - oink\n\n\n\n- Pig - oink',
		settings: { enableNlpKeywords: false },
		source: 'notes/daily.md',
	});

	await processFileAndPreview(plugin);

	const names = plugin.previewSuggestions.map((s) => s.name).filter((n) => n === 'Cow' || n === 'Pig');
	const cow = names.indexOf('Cow');
	const pig = names.indexOf('Pig');
	assert.ok(cow >= 0 && pig >= 0, `expected both phrases, got ${JSON.stringify(names)}`);
	assert.ok(cow < pig, `clustered "Cow" should rank above scattered "Pig", got ${JSON.stringify(names)}`);
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

test('processVaultAndPreview reports progress once per scanned file', async () => {
	const plugin = fakePlugin({
		files: {
			'a/one.md': '- Cow - moo',
			'a/two.md': '- Cow - moo',
			'a/three.md': '- Cow - moo',
		},
		settings: { enableNlpKeywords: false },
	});
	const progress: Array<{ done: number; total: number }> = [];

	await processVaultAndPreview(plugin, (done, total) => progress.push({ done, total }));

	// One report per file, monotonic, ending at the scanned total.
	assert.equal(progress.length, 3);
	assert.deepEqual(progress.map((p) => p.done), [1, 2, 3]);
	assert.ok(progress.every((p) => p.total === 3));
});

test('vault NLP aggregates cached counts across files without extra reads', async () => {
	const plugin = fakePlugin({
		files: {
			'a/one.md': 'Security is reviewed here. - Template - t',
			'a/two.md': 'Security is also reviewed here.',
		},
		settings: { enableTemplateKeywords: true },
	});
	let reads = 0;
	const origRead = plugin.read.bind(plugin);
	plugin.read = async (f) => {
		reads++;
		return origRead(typeof f === 'string' ? f : f.path);
	};

	await processVaultAndPreview(plugin);

	// One read per file for the template scan only; NLP aggregates cached counts.
	assert.equal(reads, 2);
	const byName = new Map(plugin.previewSuggestions.map((s) => [s.name, s]));
	const sec = byName.get('Security');
	assert.ok(sec, 'Security suggested via cached aggregate');
	assert.ok((sec?.count ?? 0) >= 2, 'count reflects aggregated vault frequency');
});

test('aborting the vault scan returns without preview or notice', async () => {
	const plugin = fakePlugin({
		files: { 'a/one.md': '- Cow - moo' },
	});
	const controller = new AbortController();
	controller.abort();

	await processVaultAndPreview(plugin, undefined, controller.signal);

	assert.deepEqual(plugin.notices, [], 'no notice on cancel');
});

test('folder scope restricts vault scanning and note creation', async () => {
	const plugin = fakePlugin({
		files: {
			'Projects/A.md': '- Cow - moo',
			'Other/B.md': '- Cow - moo',
		},
		settings: { scope: 'folder', scopeFolder: 'Projects', enableNlpKeywords: false },
	});

	await processVaultAndPreview(plugin);

	const cow = plugin.previewSuggestions.find((s) => s.name === 'Cow');
	assert.ok(cow, 'Cow discovered inside scope');
	assert.deepEqual(cow?.sources, ['Projects/A.md'], 'only in-scope file contributes');
	await plugin.applyPreview([plugin.previewSuggestions.indexOf(cow!)]);
	assert.match(await plugin.read('Projects/Cow.md'), /moo/, 'note created inside scope folder');
	assert.match(await plugin.read('Projects/A.md'), /\[\[Cow\]\]/, 'in-scope file linked');
	assert.equal(await plugin.read('Other/B.md'), '- Cow - moo', 'out-of-scope file untouched');
});

test('frontmatter namespace overrides the note creation folder', async () => {
	const plugin = fakePlugin({
		doc: '---\nnamespace: proj\n---\n\n- Cow - moo',
		source: 'notes/daily.md',
		settings: { enableNlpKeywords: false },
	});
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};

	await processFileAndPreview(plugin);
	await plugin.applyPreview([0]);

	assert.match(await plugin.read('proj/Cow.md'), /moo/, 'note created inside the frontmatter namespace');
	assert.match(setWith, /\[\[Cow\]\]/, 'keyword linked in the source doc');
});

test('same-folder scope only scans the source folder', async () => {
	const plugin = fakePlugin({
		files: {
			'a/one.md': '- Cow - moo',
			'b/two.md': '- Cow - moo',
		},
		settings: { scope: 'same', enableNlpKeywords: false },
	});

	await processVaultAndPreview(plugin);

	// fake folder() === 'a', so only a/one.md is in scope.
	const cow = plugin.previewSuggestions.find((s) => s.name === 'Cow');
	assert.ok(cow, 'Cow discovered in the active folder');
	assert.deepEqual(cow?.sources, ['a/one.md']);
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

	await processFileAndPreview(plugin);
	await plugin.applyPreview([0]);

	assert.ok(plugin.getFileByPath('a/Cows.md'), 'note created');
	assert.match(setWith, /\[\[Cows\]\]/, 'source doc linked');
});

test('processFileAndPreview offers a vault-context NLP list to the modal', async () => {
	const plugin = fakePlugin({
		source: 'a/note.md',
		doc: 'Cow is here once.',
		files: { 'a/other.md': 'Cow appears. Cow again. Cow thrice.' },
		settings: { enableTemplateKeywords: false },
	});

	await processFileAndPreview(plugin);

	// Secondary list: vault frequency lifts the once-in-note phrase up.
	const secondary = await plugin.secondary?.load();
	assert.ok(secondary?.length, 'secondary vault-context list populated');
	const v = secondary?.find((s) => s.name.toLowerCase() === 'cow');
	assert.ok(v, 'cow present via vault context despite single local use');
	assert.ok((v?.count ?? 0) > 1, 'count reflects vault frequency');
});

test('applying a vault-context suggestion (listIndex 1) creates and links the note', async () => {
	const plugin = fakePlugin({
		source: 'a/note.md',
		doc: 'Cow is here once.',
		files: { 'a/other.md': 'Cow appears. Cow again.' },
		settings: { enableTemplateKeywords: false },
	});
	let setWith = '';
	plugin.set = (c) => {
		setWith = c;
	};

	await processFileAndPreview(plugin);
	await plugin.applyPreview([0], 1);

	assert.ok(plugin.getFileByPath('a/Cow.md'), 'note created from vault-context suggestion');
	assert.match(setWith, /\[\[Cow\]\]/, 'current note linked');
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

test('new notes go into the configured subfolder', async () => {
	const plugin = fakePlugin({
		doc: '- Cow - moo',
		settings: { enableNlpKeywords: false, newNoteFolder: 'Concepts' },
	});

	await processFileAndPreview(plugin);
	await plugin.applyPreview([0]);

	assert.ok(plugin.getFileByPath('a/Concepts/Cow.md'), 'note created in subfolder');
});

test('closest mode reuses the nearest existing folder walking up', async () => {
	const plugin = fakePlugin({
		doc: '- Cow - moo',
		folders: ['Concepts'],
		promptFolder: async () => {
			throw new Error('should not prompt when a match exists');
		},
		settings: { enableNlpKeywords: false, newNoteFolder: 'Concepts', newFolderMode: 'closest' },
	});

	await processFileAndPreview(plugin);
	await plugin.applyPreview([0]);

	assert.ok(plugin.getFileByPath('Concepts/Cow.md'), 'note created in closest match');
});

test('closest mode prompts when nothing matches and honors the answer', async () => {
	let promptedWith = '';
	const plugin = fakePlugin({
		doc: '- Cow - moo',
		promptFolder: async (def) => {
			promptedWith = def;
			return 'Picked/Place';
		},
		settings: { enableNlpKeywords: false, newNoteFolder: 'Concepts', newFolderMode: 'closest' },
	});

	await processFileAndPreview(plugin);
	await plugin.applyPreview([0]);

	assert.equal(promptedWith, 'a/Concepts', 'prompt defaults to subfolder path');
	assert.ok(plugin.getFileByPath('Picked/Place/Cow.md'), 'note created at chosen path');
});

test('linkExistingNotes links unresolved wikilink targets', () => {
	let setWith = '';
	const plugin = fakePlugin({
		doc: 'FileB is important here',
		source: 'notes/FileC.md',
		unresolved: ['FileB'],
		settings: { enableExistingLinks: true, linkUnresolved: true },
	});
	plugin.set = (c) => { setWith = c; };

	linkExistingNotes(plugin);

	assert.match(setWith, /\[\[FileB\]\] is important here/);
});

test('linkExistingNotes does not link unresolved when setting is off', () => {
	let setWith = '';
	const plugin = fakePlugin({
		doc: 'FileB is important here',
		source: 'notes/FileC.md',
		unresolved: ['FileB'],
		settings: { enableExistingLinks: true, linkUnresolved: false },
	});
	plugin.set = (c) => { setWith = c; };

	linkExistingNotes(plugin);

	assert.equal(setWith, '', 'no set call when linkUnresolved is off');
});

test('linkExistingNotes: real file takes precedence over unresolved link', () => {
	let setWith = '';
	const plugin = fakePlugin({
		doc: 'FileB is here',
		files: { 'b/FileB.md': 'content' },
		source: 'notes/Other.md',
		unresolved: ['FileB'],
		settings: { enableExistingLinks: true, linkUnresolved: true },
	});
	plugin.set = (c) => { setWith = c; };

	linkExistingNotes(plugin);

	// Real file basename "FileB" should be used (not an unresolved entry).
	assert.match(setWith, /\[\[FileB\]\] is here/);
	assert.ok(plugin.getFileByPath('b/FileB.md'), 'real file exists');
});

test('preview includes existing-note suggestions; applying links without creating', async () => {
	const plugin = fakePlugin({
		source: 'Note.md',
		doc: 'a cow and security talk',
		files: { 'Cow.md': 'existing content', 'Security.md': 'existing content' },
		settings: {
			enableTemplateKeywords: false,
			enableNlpKeywords: false,
			enableExistingLinks: true,
			existingMatchMode: 'exact',
		},
	});
	await processFileAndPreview(plugin);
	const pairs = plugin.previewSuggestions.map((s) => [s.name, s.existing] as const);
	assert.equal(pairs.length, 2);
	assert.deepEqual(pairs, [
		['Cow', true],
		['Security', true],
	]);
	await plugin.applyPreview([0]);
	assert.equal(plugin.files.size, 2, 'no new note created');
	assert.equal(plugin.files.get('Cow.md'), 'existing content');
	assert.equal(plugin.notices.at(-1), 'Created 0, appended 0. Linked 1 keyword(s).');
});

test('linkTemplateKeywords skips a template line for the note itself (self-link)', () => {
	const plugin = fakePlugin({
		doc: '- Cow - moo',
		source: 'notes/Cow.md',
	});
	let setWith = '';
	plugin.set = (c) => { setWith = c; };

	linkTemplateKeywords(plugin);

	assert.equal(setWith, '', 'self-link line not rendered');
	assert.deepEqual(plugin.notices, ['No template matches found.']);
});

test('processFileAndPreview drops a suggestion for the current note', async () => {
	const plugin = fakePlugin({
		doc: '- Cow - moo',
		source: 'notes/Cow.md',
		settings: { enableNlpKeywords: false },
	});
	await processFileAndPreview(plugin);
	assert.deepEqual(plugin.notices, ['No keyword matches found.']);
});

test('processFileAndPreview filters self-note from vault-context list', async () => {
	const plugin = fakePlugin({
		source: 'a/Cow.md',
		doc: 'Cow appears once here.',
		files: { 'a/other.md': 'Cow appears. Cow again. Cow thrice.' },
		settings: { enableTemplateKeywords: false },
	});
	await processFileAndPreview(plugin);
	const secondary = await plugin.secondary?.load();
	assert.ok(secondary, 'secondary list loaded');
	assert.ok(!secondary?.some((s) => s.name.toLowerCase() === 'cow'), 'cow filtered from vault-context');
});

test('processVaultAndPreview does not link a note into its own file', async () => {
	const plugin = fakePlugin({
		files: {
			'a/Cow.md': '- Cow - moo',
			'a/two.md': '- Cow - moo',
		},
		settings: { enableNlpKeywords: false },
	});
	await processVaultAndPreview(plugin);
	// The vault-wide suggestion is legit (two.md needs it)…
	assert.ok(plugin.previewSuggestions.some((s) => s.name === 'Cow'), 'Cow still suggested vault-wide');
	await plugin.applyPreview([0]);
	// …but applying must not turn Cow.md's own line into a self-[[Cow]] link.
	assert.match(await plugin.read('a/Cow.md'), /^- Cow - moo$/m, 'Cow.md line stays self-reference-free');
	assert.doesNotMatch(await plugin.read('a/Cow.md'), /\[\[Cow\]\]/, 'no self-link inside Cow.md');
	assert.match(await plugin.read('a/two.md'), /\[\[Cow\]\]/, 'other file linked');
});

test('exportKeywordFile writes JSON with template, NLP, and existing-note keywords', async () => {
	const plugin = fakePlugin({
		files: {
			'a/one.md': '- Cow - moo',
			'Cow.md': 'existing note',
		},
		settings: { enableNlpKeywords: false },
	});
	await exportKeywordFile(plugin, 'kw.json');
	const raw = await plugin.read('kw.json');
	const data = JSON.parse(raw) as { version: number; keywords: Array<{ name: string; aliases: string[]; content?: string }> };
	assert.equal(data.version, 1);
	assert.ok(data.keywords.length >= 2, 'Cow suggestion + Cow note both exported');
	const cow = data.keywords.filter((k) => k.name === 'Cow');
	assert.ok(cow.length >= 1, 'Cow present');
});

test('importKeywordFile creates notes for each exported keyword record', async () => {
	const plugin = fakePlugin({
		files: {
			'kw.json': JSON.stringify({
				version: 1,
				keywords: [
					{ name: 'Cow', aliases: ['cows'], content: 'moo' },
					{ name: 'Pig', aliases: [], content: 'oink' },
				],
			}),
		},
		settings: { enableNlpKeywords: false },
	});
	const n = await importKeywordFile(plugin, 'kw.json');
	assert.equal(n, 2);
	assert.ok(plugin.getFileByPath('Cow.md'), 'Cow.md created');
	assert.ok(plugin.getFileByPath('Pig.md'), 'Pig.md created');
	assert.match(await plugin.read('Cow.md'), /moo/);
	assert.match(plugin.notices.at(-1) ?? '', /created 2/);
});

test('importKeywordFile reports a parse error and creates nothing', async () => {
	const plugin = fakePlugin({ files: { 'kw.json': 'not json {' } });
	const n = await importKeywordFile(plugin, 'kw.json');
	assert.equal(n, 0);
	assert.match(plugin.notices.at(-1) ?? '', /Invalid JSON/);
});
