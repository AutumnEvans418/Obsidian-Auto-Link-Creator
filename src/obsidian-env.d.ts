import { App, type Command } from 'obsidian';

declare module 'obsidian' {
	interface App {
		commands?: {
			commands?: Record<string, Command>;
		};
	}
}
