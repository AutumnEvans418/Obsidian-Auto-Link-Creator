import { Modal, App } from 'obsidian';
import { mount, unmount } from 'svelte';
import PreviewModal from './ui/PreviewModal.svelte';
import type { Suggestion } from './ui/suggestion.ts';

export class PreviewSuggestModal extends Modal {
	private comp: ReturnType<typeof mount> | undefined;

	constructor(
		app: App,
		private suggestions: Suggestion[],
		private onApply: (indices: number[], listIndex?: number) => Promise<void>,
		private debug = false,
		private secondary?: { label: string; load: () => Promise<Suggestion[]> },
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('alc-preview');
		this.comp = mount(PreviewModal, {
			target: contentEl,
			props: {
				suggestions: this.suggestions,
				debug: this.debug,
				secondary: this.secondary,
				onApply: (indices: number[], listIndex: number) => {
					void this.onApply(indices, listIndex)
						.then(() => this.close())
						.catch((err) => console.error('Auto Link Creator:', err));
				},
				onCancel: () => this.close(),
			},
		});
	}

	onClose() {
		if (this.comp) void unmount(this.comp);
		this.contentEl.empty();
	}
}
