import { requestUrl } from "obsidian";
import type { FetchResult } from "./types";

export async function fetchGitHub(
	owner: string,
	repo: string,
	githubToken: string,
	timeoutMs: number,
): Promise<FetchResult> {
	try {
		const headers: Record<string, string> = {
			"Accept": "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		};
		if (githubToken) headers["Authorization"] = `Bearer ${githubToken}`;

		const [repoRes, readmeRes] = await Promise.all([
			withTimeout(
				requestUrl({ url: `https://api.github.com/repos/${owner}/${repo}`, headers, throw: false }),
				timeoutMs,
			),
			withTimeout(
				requestUrl({
					url: `https://api.github.com/repos/${owner}/${repo}/readme`,
					headers: { ...headers, Accept: "application/vnd.github.raw" },
					throw: false,
				}),
				timeoutMs,
			),
		]);

		if (repoRes.status < 200 || repoRes.status >= 300) {
			return { content: "", meta: {}, source: "github", ok: false, error: `repo http ${repoRes.status}` };
		}
		const repoJson = repoRes.json as {
			description?: string;
			stargazers_count?: number;
			language?: string;
			topics?: string[];
			default_branch?: string;
			homepage?: string;
			license?: { spdx_id?: string };
		};

		const meta: Record<string, string | number | string[]> = {};
		if (repoJson.description) meta.description = repoJson.description;
		if (typeof repoJson.stargazers_count === "number") meta.stars = repoJson.stargazers_count;
		if (repoJson.language) meta.language = repoJson.language;
		if (repoJson.topics && repoJson.topics.length) meta.topics = repoJson.topics;
		if (repoJson.homepage) meta.homepage = repoJson.homepage;
		if (repoJson.license?.spdx_id) meta.license = repoJson.license.spdx_id;

		const body: string[] = [];
		body.push(`**Repo:** [${owner}/${repo}](https://github.com/${owner}/${repo})`);
		if (repoJson.description) body.push(`**Description:** ${repoJson.description}`);
		if (typeof repoJson.stargazers_count === "number") body.push(`**Stars:** ${repoJson.stargazers_count}`);
		if (repoJson.language) body.push(`**Language:** ${repoJson.language}`);
		if (repoJson.topics?.length) body.push(`**Topics:** ${repoJson.topics.join(", ")}`);

		if (readmeRes.status >= 200 && readmeRes.status < 300) {
			body.push("\n### README\n\n" + (readmeRes.text ?? ""));
		} else {
			body.push("\n_README not available._");
		}

		return { content: body.join("\n"), meta, source: "github", ok: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { content: "", meta: {}, source: "github", ok: false, error: msg };
	}
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
	return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
