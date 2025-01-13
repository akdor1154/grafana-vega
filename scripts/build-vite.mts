import type { ConfigEnv, PluginOption, UserConfig } from "vite";
import { defineConfig } from "vite";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
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
				entry: `${SOURCE_DIR}/module.ts`,
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
			ajvCompilerPlugin(),
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

function ajvCompilerPlugin(): PluginOption {
	const ajv = new Ajv({
		code: {
			source: true,
			esm: true,
			// formats: _`formats")`,
		},
		strictTypes: false,
		allowUnionTypes: true,
		formats: { "color-hex": true },
	});
	addFormats(ajv);
	async function buildValidator(path: string) {
		const s = await readFile(path, { encoding: "utf-8" });
		const obj = JSON.parse(s);
		const validator = ajv.compile(obj);
		let moduleSource = standaloneCode(ajv, validator);
		const requires = /require\((.+?)\)/g;
		const imports: { [k: string]: string } = {};
		let i = 0;
		moduleSource = moduleSource.replaceAll(requires, (match, impPath) => {
			if (!(impPath in imports)) {
				const name = `jw_imp${i++}`;
				imports[impPath] = name;
			}
			return imports[impPath];
		});
		const importString = Object.entries(imports)
			.map(([path, name]) => `import * as ${name} from ${path};`)
			.join("\n");
		moduleSource = '"use strict"\n' + importString + moduleSource;
		await writeFile(basename(path) + ".mjs", moduleSource);
		return moduleSource;
	}
	const prefix = "\0AJVCOMP:";
	return {
		name: "ajvCompile",
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (source.endsWith("json?ajv")) {
				const resolution = await this.resolve(source, importer, options);
				if (!resolution || resolution.external) return resolution;
				const id = resolution.id;
				return `${prefix}${id.slice(0, id.length - 4)}.ajv.mjs`;
			}
		},
		async load(id) {
			if (id.startsWith(prefix)) {
				const info = this.getModuleInfo(id);
				let path = id.split(":", 2)[1];
				path = path.slice(0, path.length - 8);

				const code = await buildValidator(path);
				return code;
			}
			return null;
		},
	};
}
export default defineConfig(buildConfig);
