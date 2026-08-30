
<script lang="ts">
import type { Suggestion } from './suggestion';
import { suggestionKinds } from './suggestion';

interface Props {
	suggestions: Suggestion[];
	onApply: (indices: number[]) => void;
	onCancel: () => void;
	/** Show provenance rows (source file/line, template, nlp root). */
	debug?: boolean;
}

let { suggestions, onApply, onCancel, debug = false }: Props = $props();

const items: Suggestion[] = [...suggestions];
let checked: boolean[] = $state(items.map(() => false));
let sortBy: 'usage' | 'name' | 'longest' | 'shortest' = $state('usage');
let query: string = $state('');
let filterMode: 'both' | 'template' | 'nlp' = $state('both');
let onlyContent: boolean = $state(false);

const view = $derived(
	[...items]
		.map((s, i) => ({ s, i }))
		.filter(({ s }) =>
			filterMode === 'both' || suggestionKinds(s).includes(filterMode),
		)
		.filter(({ s }) => !onlyContent || !!s.content)
		.filter(({ s }) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
		.sort((a, b) => {
			if (sortBy === 'usage')
				return (b.s.count ?? 0) - (a.s.count ?? 0) || a.s.name.localeCompare(b.s.name);
			if (sortBy === 'longest') return b.s.name.length - a.s.name.length;
			if (sortBy === 'shortest') return a.s.name.length - b.s.name.length;
			return a.s.name.localeCompare(b.s.name);
		}),
);

let selectedCount = $derived(checked.filter(Boolean).length);

const excerpt = (content: string): string => {
	const lines = content.split('\n');
	const visible = lines.slice(0, 3);
	return (lines.length > 3 ? visible.join(' / ') + ' …' : visible.join(' / ')) || '';
};
</script>


<h2 class="alc-preview-title">Create note suggestions</h2>

{#if items.length === 0}
	<p class="alc-preview-empty">No template matches found in this note.</p>
{:else}
	<div class="alc-preview-toolbar">
		<label class="alc-sort">
			Sort
			<select bind:value={sortBy}>
				<option value="usage">Most used</option>
				<option value="name">Name A–Z</option>
				<option value="longest">Longest keyword</option>
				<option value="shortest">Shortest keyword</option>
			</select>
		</label>
		<label class="alc-sort">
			Source
			<select bind:value={filterMode}>
				<option value="both">Both</option>
				<option value="template">Template</option>
				<option value="nlp">NLP</option>
			</select>
		</label>
		<label class="alc-sort">
			<input type="checkbox" bind:checked={onlyContent} />
			Has content
		</label>
		<input
			class="alc-search"
			type="search"
			placeholder="Filter…"
			aria-label="Filter suggestions"
			bind:value={query}
		/>
		<span class="alc-preview-selected">{selectedCount} / {items.length}</span>
	</div>
	<div class="alc-preview-toolbar">
		<button type="button" onclick={() => (checked = checked.map(() => true))}>Select all</button>
		<button type="button" onclick={() => (checked = checked.map(() => false))}>Select none</button>
	</div>
	{#if view.length === 0}
		<p class="alc-preview-empty">No suggestions match "{query}".</p>
	{:else}
	<ul class="alc-preview-list">
		{#each view as { s, i }}
			<li>
				<input
					type="checkbox"
					bind:checked={checked[i]}
					tabindex="0"
				/>
				<div class="alc-preview-item">
					<span class="alc-preview-name">{s.name}</span>
					{#if s.existing}
						<span class="alc-preview-existing">existing note</span>
					{/if}
					{#if s.count}
						<span class="alc-preview-usage">used {s.count}&times;</span>
					{/if}
					{#if s.targetFolder !== undefined}
						<span class="alc-preview-folder">→ {s.targetFolder || 'vault root'}</span>
					{/if}
					{#if debug && s.sources?.length}
						<span class="alc-preview-sources" title={s.sources.join('\n')}>
							in {s.sources.slice(0, 3).join(', ')}{s.sources.length > 3
								? ` +${s.sources.length - 3} more`
								: ''}
						</span>
					{/if}
					{#if debug && s.templates?.length}
						<span class="alc-preview-template" title={s.templates.join('\n')}>
							template: {s.templates[0]}{s.templates.length > 1
								? ` (+${s.templates.length - 1})`
								: ''}
						</span>
					{/if}
					{#if debug && s.nlpRoot}
						<span class="alc-preview-nlp">
							nlp root "{s.nlpRoot}"{s.aliases.length
								? ` · variants: ${s.aliases.join(', ')}`
								: ''}
						</span>
					{/if}
					{#if !debug && s.aliases.length}
						<span class="alc-preview-aliases">Aliases: {s.aliases.join(', ')}</span>
					{/if}
					{#if s.content}
						<span class="alc-preview-content">{excerpt(s.content)}</span>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
	{/if}
{/if}

<div class="alc-preview-actions">
	<button type="button" onclick={onCancel} class="mod-ghost">Cancel</button>
	<button
		type="button"
		onclick={() => {
			const idx = checked
				.map((on, i) => (on ? i : -1))
				.filter((i) => i !== -1);
			onApply(idx);
		}}
		disabled={selectedCount === 0}
		class="mod-cta"
	>
		Create {selectedCount} note{selectedCount === 1 ? '' : 's'}
	</button>
</div>

<style>
	h2.alc-preview-title {
		margin: 0 0 0.5em;
	}
	.alc-preview-empty {
		opacity: 0.7;
		margin: 0.5em 0;
	}
	.alc-preview-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		align-items: center;
		margin-bottom: 0.5em;
	}
	.alc-sort {
		display: flex;
		align-items: center;
		gap: 0.35em;
		font-size: 0.9em;
		opacity: 0.8;
	}
	.alc-search {
		flex: 1;
		min-width: 6em;
		height: 1.8em;
		font-size: 0.9em;
	}
	.alc-preview-selected {
		opacity: 0.7;
		font-size: 0.9em;
		margin-left: auto;
	}
	.alc-preview-usage {
		opacity: 0.55;
		font-size: 0.85em;
	}
	.alc-preview-existing {
		opacity: 0.6;
		font-size: 0.85em;
		font-style: italic;
		text-transform: uppercase;
	}
	.alc-preview-sources,
	.alc-preview-template,
	.alc-preview-nlp {
		opacity: 0.55;
		font-size: 0.85em;
		font-family: var(--font-monospace);
	}
	.alc-preview-folder {
		opacity: 0.55;
		font-size: 0.85em;
		font-style: italic;
		font-family: var(--font-monospace);
	}
	.alc-preview-list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 50vh;
		overflow-y: auto;
	}
	.alc-preview-list li {
		display: flex;
		gap: 0.6em;
		align-items: flex-start;
		padding: 0.4em 0.2em;
		border-bottom: 1px solid var(--background-modifier-border);
	}
	.alc-preview-list input[type='checkbox'] {
		margin-top: 0.3em;
	}
	.alc-preview-item {
		display: flex;
		flex-direction: column;
		gap: 0.1em;
	}
	.alc-preview-name {
		font-weight: var(--font-semibold);
	}
	.alc-preview-aliases {
		opacity: 0.7;
		font-size: 0.9em;
	}
	.alc-preview-content {
		opacity: 0.6;
		font-size: 0.9em;
	}
	.alc-preview-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5em;
		margin-top: 1em;
	}
</style>
