import { requestUrl } from "obsidian";
import type { FetchResult } from "./types";

const CONSENT_COOKIE = "CONSENT=YES+cb.20210328-17-p0.en+FX+000; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMzE5LjA2X3AwGgJlbiACGgYIgIvQrwY";

const BROWSER_HEADERS = {
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
	"Accept-Language": "en-US,en;q=0.9",
	"Cookie": CONSENT_COOKIE,
};

export async function fetchYouTube(videoId: string, timeoutMs: number): Promise<FetchResult> {
	try {
		const watchRes = await Promise.race([
			requestUrl({
				url: `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US`,
				headers: BROWSER_HEADERS,
				throw: false,
			}),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);

		if (watchRes.status < 200 || watchRes.status >= 300) {
			return { content: "", meta: {}, source: "youtube", ok: false, error: `http ${watchRes.status}` };
		}

		const html = watchRes.text ?? "";

		if (isConsentPage(html)) {
			return {
				content: "",
				meta: { videoId },
				source: "youtube",
				ok: false,
				error: "youtube returned consent page (cookie not accepted)",
			};
		}

		const meta: Record<string, string> = { videoId };
		const title = extractMetaContent(html, "title") ?? extractOg(html, "title");
		if (title) meta.ytTitle = title;
		const author = matchJson(html, /"author":"([^"]+)"/);
		if (author) meta.ytAuthor = author;
		const channel = matchJson(html, /"ownerChannelName":"([^"]+)"/);
		if (channel && !meta.ytAuthor) meta.ytAuthor = channel;
		const lengthSec = matchJson(html, /"lengthSeconds":"(\d+)"/);
		if (lengthSec) meta.ytLengthSeconds = lengthSec;
		const publishDate = matchJson(html, /"publishDate":"([^"]+)"/);
		if (publishDate) meta.ytPublishDate = publishDate;
		const isShort = /"isShortsEligible":true|"webCommandMetadata":\{[^}]*"url":"\/shorts\//.test(html);
		if (isShort) meta.ytShort = "true";

		const description = extractDescription(html);

		const { transcript, reason } = await tryTranscript(videoId, html, timeoutMs);
		if (!transcript && reason) meta.transcriptReason = reason;

		const body: string[] = [];
		if (meta.ytAuthor) body.push(`**Channel:** ${meta.ytAuthor}`);
		if (meta.ytPublishDate) body.push(`**Published:** ${meta.ytPublishDate}`);
		if (meta.ytLengthSeconds) body.push(`**Length:** ${formatLength(Number(meta.ytLengthSeconds))}`);
		body.push(`**Video:** https://www.youtube.com/watch?v=${videoId}`);
		if (description) body.push("\n### Description\n\n" + description.trim());
		if (transcript) {
			body.push("\n### Transcript\n\n" + transcript);
		} else {
			body.push(`\n_No transcript: ${reason ?? "unknown reason"}._`);
		}

		return {
			content: body.join("\n"),
			meta,
			source: "youtube",
			ok: true,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { content: "", meta: {}, source: "youtube", ok: false, error: msg };
	}
}

function isConsentPage(html: string): boolean {
	return (
		html.includes("consent.youtube.com") ||
		html.includes('action="https://consent.youtube.com/save"') ||
		(html.length < 50000 && html.includes("Before you continue"))
	);
}

function extractMetaContent(html: string, name: string): string | null {
	const re = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]+)"`, "i");
	const m = html.match(re);
	return m ? decodeHtml(m[1]) : null;
}

function extractOg(html: string, key: string): string | null {
	const re = new RegExp(`<meta\\s+property="og:${key}"\\s+content="([^"]+)"`, "i");
	const m = html.match(re);
	return m ? decodeHtml(m[1]) : null;
}

function matchJson(html: string, re: RegExp): string | null {
	const m = html.match(re);
	if (!m) return null;
	try {
		return JSON.parse(`"${m[1]}"`);
	} catch {
		return m[1];
	}
}

function extractDescription(html: string): string {
	const patterns = [
		/"shortDescription":"([\s\S]*?)","isCrawlable"/,
		/"shortDescription":"([\s\S]*?)"[,}]/,
		/<meta\s+name="description"\s+content="([^"]+)"/i,
		/<meta\s+property="og:description"\s+content="([^"]+)"/i,
	];
	for (const re of patterns) {
		const m = html.match(re);
		if (m) {
			try {
				return JSON.parse(`"${m[1]}"`);
			} catch {
				return decodeHtml(m[1]);
			}
		}
	}
	return "";
}

interface TranscriptAttempt {
	transcript: string;
	reason: string | null;
}

async function tryTranscript(
	videoId: string,
	html: string,
	timeoutMs: number,
): Promise<TranscriptAttempt> {
	const innertubeTracks = await fetchInnertubeCaptionTracks(videoId, timeoutMs);
	const htmlTracks = extractCaptionTracks(html);
	const tracks = innertubeTracks.length > 0 ? innertubeTracks : htmlTracks;

	if (tracks.length === 0) {
		return { transcript: "", reason: "no caption tracks (video has no captions)" };
	}

	const track = pickTrack(tracks);
	const source = innertubeTracks.length > 0 ? "innertube" : "html";

	const srv1 = await fetchTranscript(forceFormat(track.baseUrl, "srv1"), timeoutMs, "xml");
	if (srv1.text) return { transcript: srv1.text, reason: null };

	const json3 = await fetchTranscript(forceFormat(track.baseUrl, "json3"), timeoutMs, "json3");
	if (json3.text) return { transcript: json3.text, reason: null };

	return {
		transcript: "",
		reason: `empty (src=${source} srv1=${srv1.diagnostic} json3=${json3.diagnostic})`,
	};
}

async function fetchInnertubeCaptionTracks(videoId: string, timeoutMs: number): Promise<CaptionTrack[]> {
	try {
		const res = await Promise.race([
			requestUrl({
				url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
				method: "POST",
				headers: {
					...BROWSER_HEADERS,
					"Content-Type": "application/json",
					"X-YouTube-Client-Name": "1",
					"X-YouTube-Client-Version": "2.20250101.00.00",
				},
				body: JSON.stringify({
					context: {
						client: {
							clientName: "WEB",
							clientVersion: "2.20250101.00.00",
							hl: "en",
							gl: "US",
						},
					},
					videoId,
				}),
				throw: false,
			}),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);
		if (res.status < 200 || res.status >= 300) return [];
		const json = res.json as {
			captions?: {
				playerCaptionsTracklistRenderer?: {
					captionTracks?: Array<{ baseUrl: string; languageCode: string; kind?: string }>;
				};
			};
		};
		const tracks = json.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
		return tracks.map((t) => ({
			baseUrl: t.baseUrl,
			languageCode: t.languageCode,
			kind: t.kind,
		}));
	} catch {
		return [];
	}
}

function forceFormat(baseUrl: string, fmt: "srv1" | "json3"): string {
	const url = baseUrl.replace(/([&?])fmt=[^&]*/g, "$1").replace(/[&?]$/, "");
	return url + (url.includes("?") ? "&" : "?") + "fmt=" + fmt;
}

interface CaptionTrack {
	baseUrl: string;
	languageCode: string;
	kind?: string;
}

function extractCaptionTracks(html: string): CaptionTrack[] {
	const patterns = [/"captionTracks":(\[[^\]]*\])/, /"captionTracks":(\[.*?\])/];
	for (const re of patterns) {
		const m = html.match(re);
		if (!m) continue;
		try {
			const arr = JSON.parse(m[1]) as Array<{ baseUrl: string; languageCode: string; kind?: string }>;
			return arr.map((t) => ({
				baseUrl: t.baseUrl.replace(/\\u0026/g, "&"),
				languageCode: t.languageCode,
				kind: t.kind,
			}));
		} catch {
			// try next pattern
		}
	}
	return [];
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack {
	const manualEn = tracks.find((t) => t.languageCode === "en" && !t.kind);
	if (manualEn) return manualEn;
	const anyEn = tracks.find((t) => t.languageCode === "en");
	if (anyEn) return anyEn;
	return tracks[0];
}

interface TranscriptFetch {
	text: string;
	diagnostic: string;
}

async function fetchTranscript(
	url: string,
	timeoutMs: number,
	kind: "xml" | "json3",
): Promise<TranscriptFetch> {
	try {
		const res = await Promise.race([
			requestUrl({ url, headers: BROWSER_HEADERS, throw: false }),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
		]);
		if (res.status < 200 || res.status >= 300) {
			return { text: "", diagnostic: `http ${res.status}` };
		}
		const body = res.text ?? "";
		if (!body.trim()) return { text: "", diagnostic: "empty body" };

		if (kind === "xml") {
			const segments = [...body.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
				decodeHtml(m[1]),
			);
			const text = segments.join(" ").replace(/\s+/g, " ").trim();
			return { text, diagnostic: text ? "ok" : `0 segments in ${body.length}B` };
		}

		try {
			const json = JSON.parse(body) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
			const events = json.events ?? [];
			const parts: string[] = [];
			for (const ev of events) {
				if (!ev.segs) continue;
				for (const seg of ev.segs) {
					if (seg.utf8) parts.push(seg.utf8);
				}
			}
			const text = parts.join(" ").replace(/\s+/g, " ").trim();
			return { text, diagnostic: text ? "ok" : `0 events in ${body.length}B` };
		} catch (e) {
			return { text: "", diagnostic: "json parse failed" };
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { text: "", diagnostic: msg };
	}
}

function formatLength(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function decodeHtml(s: string): string {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/\n/g, " ");
}
