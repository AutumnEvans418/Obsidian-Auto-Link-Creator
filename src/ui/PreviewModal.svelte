
<script lang="ts">
import type { Suggestion } from './suggestion';

interface Props {
	suggestions: Suggestion[];
	onApply: (indices: number[]) => void;
	onCancel: () => void;
}

let { suggestions, onApply, onCancel }: Props = $props();

let items: Suggestion[] = $state([...suggestions]);
let checked: boolean[] = $state(items.map(() => true));

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
		<button type="button" onclick={() => (checked = checked.map(() => true))}>Select all</button>
		<button type="button" onclick={() => (checked = checked.map(() => false))}>Select none</button>
		<span class="alc-preview-count">{selectedCount} / {items.length}</span>
	</div>
	<ul class="alc-preview-list">
		{#each items as s, i}
			<li>
				<input
					type="checkbox"
					bind:checked={checked[i]}
					tabindex="0"
				/>
				<div class="alc-preview-item">
					<span class="alc-preview-name">{s.name}</span>
					{#if s.aliases.length}
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
		gap: 0.5em;
		align-items: center;
		margin-bottom: 0.5em;
	}
	.alc-preview-count {
		opacity: 0.7;
		font-size: 0.9em;
		margin-left: auto;
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
