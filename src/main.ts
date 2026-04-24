import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, RaindropToMarkdownSettings } from "./settings";
import { RaindropAPI } from "./raindrop-api";
import { runSync, testOnSingleUrl } from "./sync-engine";

export default class RaindropToMarkdownPlugin extends Plugin {
	settings!: RaindropToMarkdownSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "test-connection",
			name: "Test Raindrop connection",
			callback: () => this.testConnection(),
		});

		this.addCommand({
			id: "list-collections",
			name: "List Raindrop collections (shows IDs)",
			callback: () => this.listCollections(),
		});

		this.addCommand({
			id: "dry-run-10",
			name: "Dry run — import 10 bookmarks",
			callback: () => this.runSyncWithErrorHandling({ limit: 10 }),
		});

		this.addCommand({
			id: "full-sync",
			name: "Full sync — import all bookmarks",
			callback: () => this.confirmThenFullSync(),
		});

		this.addCommand({
			id: "test-url",
			name: "Test fetch on a single URL",
			callback: () => this.promptTestUrl(),
		});

		this.addSettingTab(new RaindropSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async listCollections() {
		if (!this.settings.apiToken) {
			new Notice("No API token set. Open plugin settings first.");
			return;
		}
		try {
			const api = new RaindropAPI(this.settings.apiToken);
			const collections = await api.listCollections();
			const sorted = [...collections].sort((a, b) => b.count - a.count);
			const lines = sorted.map((c) => `${c._id}\t${c.count}\t${c.title}`);
			const summary = lines.slice(0, 10).join("\n");
			console.log("[raindrop-to-markdown] Collections (ID / count / title):");
			console.log("0\t(all)\tAll bookmarks");
			console.log(lines.join("\n"));
			new Notice(
				`Found ${collections.length} collections. Top 10:\n${summary}\n(Full list in Developer Console.)`,
				15000,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`List collections failed: ${msg}`);
		}
	}

	private async testConnection() {
		if (!this.settings.apiToken) {
			new Notice("No API token set. Open plugin settings first.");
			return;
		}
		try {
			const api = new RaindropAPI(this.settings.apiToken);
			const user = await api.getUser();
			new Notice(`Raindrop connected: ${user.email}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Raindrop connection failed: ${msg}`);
		}
	}

	private async runSyncWithErrorHandling(opts: { limit?: number }) {
		try {
			await runSync(this.app, this.settings, { limit: opts.limit });
			await this.saveSettings();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Sync failed: ${msg}`);
		}
	}

	private async confirmThenFullSync() {
		new ConfirmModal(
			this.app,
			"Full Raindrop sync",
			"This will import every bookmark in your selected collection. It can take a while (minutes to over an hour for large collections). Continue?",
			() => this.runSyncWithErrorHandling({}),
		).open();
	}

	private async promptTestUrl() {
		new UrlPromptModal(this.app, async (url) => {
			if (!url) return;
			await testOnSingleUrl(this.app, this.settings, url);
		}).open();
	}
}

class RaindropSettingTab extends PluginSettingTab {
	plugin: RaindropToMarkdownPlugin;

	constructor(app: App, plugin: RaindropToMarkdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Authentication").setHeading();
		new Setting(containerEl)
			.setName("Raindrop API token")
			.setDesc("Generate at app.raindrop.io/settings/integrations → Create new app → Test token.")
			.addText((text) =>
				text
					.setPlaceholder("paste token")
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (v) => {
						this.plugin.settings.apiToken = v.trim();
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("GitHub token (optional)")
			.setDesc("Raises the GitHub API rate limit when fetching READMEs. Use a personal access token with repo read.")
			.addText((text) =>
				text
					.setPlaceholder("ghp_...")
					.setValue(this.plugin.settings.githubToken)
					.onChange(async (v) => {
						this.plugin.settings.githubToken = v.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Import location").setHeading();
		new Setting(containerEl)
			.setName("Target folder")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.targetFolder)
					.onChange(async (v) => {
						this.plugin.settings.targetFolder = v.trim() || "Clippings";
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Filename template")
			.setDesc("Uses {{id}} and {{title}}. Keep {{id}} first to avoid collisions.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.filenameTemplate)
					.onChange(async (v) => {
						this.plugin.settings.filenameTemplate = v.trim() || "{{id}}_{{title}}";
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Collection ID")
			.setDesc("0 = all collections. Use a specific numeric collection ID to limit scope.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.collectionId))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						this.plugin.settings.collectionId = Number.isFinite(n) ? n : 0;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Skip existing files")
			.setDesc("If off, each sync overwrites matching files in the target folder.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.skipExisting).onChange(async (v) => {
					this.plugin.settings.skipExisting = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Content fetchers").setHeading();
		for (const [name, key] of [
			["Articles (Readability)", "enableArticle"],
			["YouTube transcripts", "enableYouTube"],
			["GitHub READMEs", "enableGitHub"],
			["PDFs", "enablePdf"],
			["Fallback scraper", "enableFallback"],
		] as const) {
			new Setting(containerEl).setName(name).addToggle((t) =>
				t
					.setValue(this.plugin.settings[key] as boolean)
					.onChange(async (v) => {
						(this.plugin.settings as unknown as Record<string, unknown>)[key] = v;
						await this.plugin.saveSettings();
					}),
			);
		}

		new Setting(containerEl).setName("Advanced").setHeading();
		new Setting(containerEl)
			.setName("Rate limit between bookmarks (ms)")
			.setDesc("Raindrop free tier allows 120 requests/minute. 600ms keeps you well under.")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.rateLimitMs))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						this.plugin.settings.rateLimitMs = Number.isFinite(n) && n >= 0 ? n : 600;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Fetch timeout (ms)")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.fetchTimeoutMs))
					.onChange(async (v) => {
						const n = parseInt(v, 10);
						this.plugin.settings.fetchTimeoutMs = Number.isFinite(n) && n >= 1000 ? n : 20000;
						await this.plugin.saveSettings();
					}),
			);

		if (this.plugin.settings.lastSyncCursor) {
			containerEl.createEl("p", {
				text: `Last successful full sync: ${this.plugin.settings.lastSyncCursor}`,
				cls: "setting-item-description",
			});
		}
	}
}

class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private body: string,
		private onConfirm: () => void,
	) {
		super(app);
	}
	onOpen() {
		this.contentEl.createEl("h2", { text: this.title });
		this.contentEl.createEl("p", { text: this.body });
		const btns = this.contentEl.createDiv({ cls: "modal-button-container" });
		const confirm = btns.createEl("button", { text: "Continue", cls: "mod-cta" });
		confirm.onclick = () => {
			this.close();
			this.onConfirm();
		};
		const cancel = btns.createEl("button", { text: "Cancel" });
		cancel.onclick = () => this.close();
	}
}

class UrlPromptModal extends Modal {
	constructor(
		app: App,
		private onSubmit: (url: string) => void,
	) {
		super(app);
	}
	onOpen() {
		this.contentEl.createEl("h2", { text: "Test fetch" });
		this.contentEl.createEl("p", { text: "Paste a URL to fetch and inspect the result." });
		const input = this.contentEl.createEl("input", { type: "text" });
		input.style.width = "100%";
		input.placeholder = "https://...";
		const btns = this.contentEl.createDiv({ cls: "modal-button-container" });
		const ok = btns.createEl("button", { text: "Fetch", cls: "mod-cta" });
		ok.onclick = () => {
			const val = input.value.trim();
			this.close();
			this.onSubmit(val);
		};
		input.focus();
	}
}
