import { App, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from "obsidian";

interface RaindropToMarkdownSettings {
	apiToken: string;
	targetFolder: string;
	filenameTemplate: string;
}

const DEFAULT_SETTINGS: RaindropToMarkdownSettings = {
	apiToken: "",
	targetFolder: "Clippings",
	filenameTemplate: "{{id}}_{{title}}",
};

export default class RaindropToMarkdownPlugin extends Plugin {
	settings!: RaindropToMarkdownSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "test-connection",
			name: "Test Raindrop connection",
			callback: () => this.testConnection(),
		});

		this.addSettingTab(new RaindropSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async testConnection() {
		if (!this.settings.apiToken) {
			new Notice("No API token set. Open plugin settings first.");
			return;
		}
		try {
			const res = await requestUrl({
				url: "https://api.raindrop.io/rest/v1/user",
				headers: { Authorization: `Bearer ${this.settings.apiToken}` },
			});
			const user = res.json?.user;
			if (user?.email) {
				new Notice(`Raindrop connected: ${user.email}`);
			} else {
				new Notice("Connected, but response unexpected.");
			}
		} catch (err) {
			new Notice(`Raindrop connection failed: ${err.message ?? err}`);
		}
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

		new Setting(containerEl)
			.setName("Raindrop API token")
			.setDesc("Generate at app.raindrop.io/settings/integrations → Create new app → Test token.")
			.addText((text) =>
				text
					.setPlaceholder("paste token")
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Target folder")
			.setDesc("Where synced bookmarks are written, relative to vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Clippings")
					.setValue(this.plugin.settings.targetFolder)
					.onChange(async (value) => {
						this.plugin.settings.targetFolder = value.trim() || "Clippings";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Filename template")
			.setDesc("Uses {{id}} and {{title}}. {{id}} first avoids collisions.")
			.addText((text) =>
				text
					.setPlaceholder("{{id}}_{{title}}")
					.setValue(this.plugin.settings.filenameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.filenameTemplate = value.trim() || "{{id}}_{{title}}";
						await this.plugin.saveSettings();
					}),
			);
	}
}
