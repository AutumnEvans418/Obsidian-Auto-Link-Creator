import {
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Modal,
	Notice,
	Plugin,
} from 'obsidian';
import {
	AutoLinkSettingTab,
	AutoLinkSettings,
	DEFAULT_SETTINGS,
} from './settings';
import { rootForm, singularize } from './nlp';
import { findAllTemplate, ParsedTemplate } from './template';
import { wikiLink } from './link';

export default class AutoLinkCreator extends Plugin {
	settings!: AutoLinkSettings;

	async onload() {
		await this.loadSettings();

		// TEMP: verify nlp-compromise bundled + loads inside Obsidian. Remove when real UI landed.
		this.addRibbonIcon('link', 'Test nlp-comprromise', () => {
			new Notice(`nlp loaded. changed→${rootForm('changed')}. Cows→${singularize('Cows')}`);
		});
		this.addCommand({
			id: 'test-nlp-load',
			name: 'Test nlp-compromise loads',
			callback: () => {
				new Notice(`changed→${rootForm('changed')}. Cows→${singularize('Cows')}`);
			},
		});

		// TEMP: debug template parser on active file. Remove once wired to real UI.
		const TEMPLATES = [
			'- {{Link Name}} ({{Link Alias}}) - {{Link Content}}',
			'- {{Link Name}} ({{Link Alias}})\n  - {{Link Content}}',
		];
		this.addCommand({
			id: 'debug-template-parse',
			name: 'Debug: parse templates on active file',
			editorCallback: (editor: Editor) => {
				const doc = editor.getValue();
				for (const tpl of TEMPLATES) {
					for (const hit of findAllTemplate(doc, tpl)) {
						console.log('[auto-link]', hit);
					}
				}
			},
		});

		// Convert matched template blocks in the active file into wiki links.
		this.addCommand({
			id: 'convert-keywords-to-links',
			name: 'Convert keywords to links',
			editorCallback: (editor: Editor) => {
				const doc = editor.getValue();
				const hits: ParsedTemplate[] = [];
				const seen = new Set<number>();
				for (const tpl of this.settings.templates) {
					for (const hit of findAllTemplate(doc, tpl)) {
						if (!seen.has(hit.lineIndex)) {
							seen.add(hit.lineIndex);
							hits.push(hit);
						}
					}
				}
				if (!hits.length) {
					new Notice('No template matches found.');
					return;
				}
				// Rewrite the whole doc in one pass (bottom-up) so multi-line
				// blocks collapse cleanly; per-line replaceRange mangles newlines.
				const out = doc.split('\n');
				const sorted = [...hits].sort((a, b) => b.lineIndex - a.lineIndex);
				for (const hit of sorted) {
					const extra = hit.content ? hit.content.split('\n').length : 0;
					out.splice(hit.lineIndex, extra + 1, `- ${wikiLink(hit)}`);
				}
				editor.setValue(out.join('\n'));
				new Notice(`Linked ${hits.length} keyword(s).`);
			},
		});

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Sample', (_evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!asdf');
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new TemplateModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo,
			) => {
				editor.replaceSelection('Sample editor command');
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new TemplateModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoLinkSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AutoLinkSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TemplateModal extends Modal {
	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
