import type { ConfigEnv, PluginOption, UserConfig } from "vite";
import { defineConfig } from "vite";

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import packageJson from "../package.json" with { type: "json" };
import pluginJson from "../src/plugin.json" with { type: "json" };

const SOURCE_DIR = "src";
const DIST_DIR = "dist";

function buildConfig(opts: ConfigEnv): UserConfig {
	const now = new Date();
	const commit = execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf-8",
	}).trim();
	return {
		base: `/public/plugins/${pluginJson.id}`,
		mode: "production",
		publicDir: `${SOURCE_DIR}/static-root`,
		build: {
			outDir: DIST_DIR,
			minify: true,
			sourcemap: true,
			lib: {
				name: pluginJson.id,
				entry: [
					`${SOURCE_DIR}/module.ts`,
					`${SOURCE_DIR}/codegen/validator.mjs`,
				],
				fileName: (format, name) => `${name}.js`,
				formats: ["amd"],
			},
			rollupOptions: {
				external: [
					"lodash",
					"jquery",
					"moment",
					"slate",
					"emotion",
					"@emotion/react",
					"@emotion/css",
					"prismjs",
					"slate-plain-serializer",
					"@grafana/slate-react",
					"react",
					"react-dom",
					"react-redux",
					"redux",
					"rxjs",
					"react-router",
					"react-router-dom",
					"d3",
					"@grafana/ui",
					"@grafana/runtime",
					"@grafana/data",
				],
			},
		},
		// assetsInclude: ["**/*.png", "**/*.svg", "**/*.woff2"],
		plugins: [
			copyReplacePlugin({
				from: `${SOURCE_DIR}/plugin.json`,
				to: "plugin.json",
				patterns: [
					[/%VERSION%/g, packageJson.version],
					[/%TODAY%/g, now.toISOString().substring(0, 10)],
					[/%PLUGIN_ID%/g, pluginJson.id],
					[/%COMMIT%/g, commit],
					[/"%TIMESTAMP%"/g, (now.getTime() / 1000).toFixed(0)],
					[/%BUILD_MODE%/g, "production"],
				],
			}),
			copyReplacePlugin({
				from: "README.md",
				to: "README.md",
				patterns: [
					[
						/src\/static-root\/img\//g,
						"https://raw.githubusercontent.com/akdor1154/grafana-vega/refs/heads/main/src/static-root/img/",
					],
				],
			}),
		],
	};
}

type CopyReplacePluginArgs = {
	from: string;
	to: string;
	patterns: [RegExp, string][];
};
function copyReplacePlugin(args: CopyReplacePluginArgs): PluginOption {
	return {
		name: "copyReplacePlugin",
		async buildEnd() {
			let source = await readFile(args.from, "utf-8");
			for (const [pat, repl] of args.patterns) {
				source = source.replaceAll(pat, repl);
			}
			this.emitFile({
				type: "asset",
				fileName: args.to,
				source: source,
			});
		},
	};
}

export default defineConfig(buildConfig);
