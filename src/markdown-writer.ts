import { App, TFile, normalizePath } from "obsidian";
import type { RaindropBookmark } from "./raindrop-api";
import type { FetchResult } from "./fetchers";
import type { RaindropToMarkdownSettings } from "./settings";

export function buildFilename(bookmark: RaindropBookmark, template: string): string {
	const safeTitle = sanitize(bookmark.title || "untitled");
	const name = template.replace("{{id}}", String(bookmark._id)).replace("{{title}}", safeTitle);
	return `${name}.md`;
}

export function buildMarkdown(
	bookmark: RaindropBookmark,
	fetch: FetchResult,
	detectedType: string,
): string {
	const domain = safeDomain(bookmark.link);
	const fm: Record<string, unknown> = {
		title: bookmark.title,
		url: bookmark.link,
		domain,
		type: detectedType,
		collection: bookmark.collection?.title ?? "",
		tags: bookmark.tags ?? [],
		created: bookmark.created,
		last_update: bookmark.lastUpdate,
		excerpt: bookmark.excerpt ?? "",
		raindrop_id: bookmark._id,
		fetch_source: fetch.source,
		fetch_ok: fetch.ok,
		enrichment_status: fetch.ok ? "fetched" : "pending",
	};
	if (!fetch.ok && fetch.error) fm.fetch_error = fetch.error;
	for (const [k, v] of Object.entries(fetch.meta)) {
		if (!(k in fm)) fm[k] = v;
	}

	const body: string[] = [];
	body.push(`# ${bookmark.title}`);
	body.push("");
	if (bookmark.excerpt) {
		body.push(`> ${bookmark.excerpt.replace(/\n/g, " ")}`);
		body.push("");
	}
	body.push(`**Source:** ${bookmark.link}`);
	body.push("");

	if (bookmark.note) {
		body.push("## My Note");
		body.push("");
		body.push(bookmark.note);
		body.push("");
	}

	if (bookmark.highlights && bookmark.highlights.length > 0) {
		body.push("## My Highlights");
		body.push("");
		for (const h of bookmark.highlights) {
			const line = h.note ? `- ${h.text} — *${h.note}*` : `- ${h.text}`;
			body.push(line);
		}
		body.push("");
	}

	body.push("## Content");
	body.push("");
	if (fetch.ok) {
		body.push(fetch.content);
	} else {
		body.push(`_Content not fetched: ${fetch.error ?? "unknown reason"}._`);
	}
	body.push("");
	body.push("<!-- ENRICHMENT_ANCHOR -->");

	return `---\n${serializeFrontmatter(fm)}---\n\n${body.join("\n")}\n`;
}

export async function writeBookmarkFile(
	app: App,
	folder: string,
	filename: string,
	content: string,
	skipExisting: boolean,
): Promise<"written" | "skipped" | "overwritten"> {
	const folderPath = normalizePath(folder);
	if (!app.vault.getAbstractFileByPath(folderPath)) {
		await app.vault.createFolder(folderPath);
	}
	const fullPath = normalizePath(`${folderPath}/${filename}`);
	const existing = app.vault.getAbstractFileByPath(fullPath);
	if (existing instanceof TFile) {
		if (skipExisting) return "skipped";
		await app.vault.modify(existing, content);
		return "overwritten";
	}
	await app.vault.create(fullPath, content);
	return "written";
}

export function shouldSkip(
	app: App,
	folder: string,
	filename: string,
	skipExisting: boolean,
): boolean {
	if (!skipExisting) return false;
	const fullPath = normalizePath(`${normalizePath(folder)}/${filename}`);
	return app.vault.getAbstractFileByPath(fullPath) instanceof TFile;
}

function sanitize(s: string): string {
	return s
		.replace(/[\\/:*?"<>|]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 120);
}

function safeDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function serializeFrontmatter(obj: Record<string, unknown>): string {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(obj)) {
		lines.push(serializeLine(key, value));
	}
	return lines.join("\n") + "\n";
}

function serializeLine(key: string, value: unknown): string {
	if (value === null || value === undefined) return `${key}: ""`;
	if (Array.isArray(value)) {
		if (value.length === 0) return `${key}: []`;
		const items = value.map((v) => quote(String(v))).join(", ");
		return `${key}: [${items}]`;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return `${key}: ${value}`;
	}
	return `${key}: ${quote(String(value))}`;
}

function quote(s: string): string {
	const needsQuote = /[:#\[\]{}&*!|>'%@`,\n"]/.test(s) || /^\s|\s$/.test(s);
	if (!needsQuote) return s;
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}
