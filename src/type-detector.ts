export type ContentType = "youtube" | "github" | "pdf" | "article" | "unknown";

export interface DetectedType {
	type: ContentType;
	hints: Record<string, string>;
}

export function detectType(url: string): DetectedType {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return { type: "unknown", hints: {} };
	}

	const host = u.hostname.replace(/^www\./, "").toLowerCase();
	const path = u.pathname;

	if (host === "youtube.com" || host === "m.youtube.com") {
		const id = u.searchParams.get("v");
		if (id) return { type: "youtube", hints: { videoId: id } };
	}
	if (host === "youtu.be") {
		const id = path.slice(1).split("/")[0];
		if (id) return { type: "youtube", hints: { videoId: id } };
	}

	if (host === "github.com") {
		const parts = path.split("/").filter(Boolean);
		if (parts.length >= 2) {
			return {
				type: "github",
				hints: { owner: parts[0], repo: parts[1].replace(/\.git$/, "") },
			};
		}
	}

	if (path.toLowerCase().endsWith(".pdf")) {
		return { type: "pdf", hints: {} };
	}

	return { type: "article", hints: {} };
}
