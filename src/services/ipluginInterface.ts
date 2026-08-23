import type { OpenViewState, TFile } from "obsidian";
import type { AutoLinkSettings } from "../settings";

export interface IPlugin {
    value(): string;
    set: (value: string) => void;
    notice: (msg: string) => void;
    settings: AutoLinkSettings;
    folder(): string;
    getFiles(folder: string): Promise<string[]>
    getFileByPath(path: string): TFile | null;
    read(normalizedPath: string): Promise<string>;
    read(normalizedPath: TFile): Promise<string>;
    write(normalizedPath: string, data: string): Promise<void>;
    modify(file: TFile, append: string): Promise<void>;
    create(path: string, data: string): Promise<TFile>;
    openFile(file: TFile, openState?: OpenViewState): Promise<IPlugin>; //			const leaf = app.workspace.getLeaf(false); 			await leaf.openFile(file, { active: false });             view = leaf.view as MarkdownView;			views.set(path, view);
    getFile(path: string): IPlugin
    
    
}