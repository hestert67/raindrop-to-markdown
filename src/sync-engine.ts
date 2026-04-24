import { App, Notice } from "obsidian";
import { RaindropAPI, RaindropBookmark, sleep } from "./raindrop-api";
import { detectType } from "./type-detector";
import { fetchContent } from "./fetchers";
import { buildFilename, buildMarkdown, shouldSkip, writeBookmarkFile } from "./markdown-writer";
import type { RaindropToMarkdownSettings } from "./settings";

export interface SyncProgress {
	total: number;
	processed: number;
	written: number;
	skipped: number;
	failed: number;
}

export interface SyncOptions {
	limit?: number; // for dry runs
	onProgress?: (p: SyncProgress) => void;
}

export async function runSync(
	app: App,
	settings: RaindropToMarkdownSettings,
	options: SyncOptions = {},
): Promise<SyncProgress> {
	if (!settings.apiToken) throw new Error("No API token. Configure in plugin settings.");

	const api = new RaindropAPI(settings.apiToken);
	const total = await api.getTotalCount(settings.collectionId);
	const progress: SyncProgress = {
		total: options.limit ? Math.min(options.limit, total) : total,
		processed: 0,
		written: 0,
		skipped: 0,
		failed: 0,
	};

	new Notice(`Raindrop sync starting: ${progress.total} bookmarks`);

	for await (const bookmark of api.iterateBookmarks(settings.collectionId)) {
		if (options.limit && progress.processed >= options.limit) break;
		try {
			const result = await processBookmark(app, settings, bookmark);
			if (result === "skipped") progress.skipped += 1;
			else progress.written += 1;
		} catch (err) {
			progress.failed += 1;
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[raindrop-to-markdown] ${bookmark._id} ${bookmark.link}: ${msg}`);
		}
		progress.processed += 1;
		options.onProgress?.(progress);

		if (progress.processed % 10 === 0) {
			new Notice(
				`Raindrop sync: ${progress.processed}/${progress.total} · ` +
					`${progress.written} written · ${progress.skipped} skipped · ${progress.failed} failed`,
			);
		}
		await sleep(settings.rateLimitMs);
	}

	new Notice(
		`Raindrop sync done: ${progress.written} written · ${progress.skipped} skipped · ${progress.failed} failed`,
	);

	if (!options.limit) {
		settings.lastSyncCursor = new Date().toISOString();
	}
	return progress;
}

export async function processBookmark(
	app: App,
	settings: RaindropToMarkdownSettings,
	bookmark: RaindropBookmark,
): Promise<"written" | "skipped" | "overwritten"> {
	const filename = buildFilename(bookmark, settings.filenameTemplate);
	if (shouldSkip(app, settings.targetFolder, filename, settings.skipExisting)) {
		return "skipped";
	}
	const { type } = detectType(bookmark.link);
	const fetchResult = await fetchContent(bookmark.link, settings);
	const markdown = buildMarkdown(bookmark, fetchResult, type);
	return writeBookmarkFile(app, settings.targetFolder, filename, markdown, settings.skipExisting);
}

export async function testOnSingleUrl(
	app: App,
	settings: RaindropToMarkdownSettings,
	url: string,
): Promise<void> {
	const { type } = detectType(url);
	const result = await fetchContent(url, settings);
	const summary = [
		`URL: ${url}`,
		`Detected type: ${type}`,
		`Source: ${result.source}`,
		`OK: ${result.ok}`,
		result.error ? `Error: ${result.error}` : null,
		`Content length: ${result.content.length} chars`,
		`Meta keys: ${Object.keys(result.meta).join(", ") || "(none)"}`,
	]
		.filter(Boolean)
		.join("\n");
	new Notice(summary, 15000);
	console.log("[raindrop-to-markdown] test fetch:\n" + summary + "\n---\n" + result.content.slice(0, 500));
}
