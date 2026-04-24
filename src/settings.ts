export interface RaindropToMarkdownSettings {
	apiToken: string;
	targetFolder: string;
	filenameTemplate: string;
	collectionId: number; // 0 = all
	skipExisting: boolean;
	rateLimitMs: number;
	fetchTimeoutMs: number;
	enableArticle: boolean;
	enableYouTube: boolean;
	enableGitHub: boolean;
	enablePdf: boolean;
	enableFallback: boolean;
	githubToken: string; // optional, raises GitHub rate limit
	lastSyncCursor: string; // ISO timestamp of last successful sync
}

export const DEFAULT_SETTINGS: RaindropToMarkdownSettings = {
	apiToken: "",
	targetFolder: "Clippings",
	filenameTemplate: "{{id}}_{{title}}",
	collectionId: 0,
	skipExisting: true,
	rateLimitMs: 600,
	fetchTimeoutMs: 20000,
	enableArticle: true,
	enableYouTube: true,
	enableGitHub: true,
	enablePdf: true,
	enableFallback: true,
	githubToken: "",
	lastSyncCursor: "",
};
