import { execFileSync } from "node:child_process";
import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone";
import esbuild from "esbuild";
import copy from "esbuild-plugin-copy";

import { readFileSync, writeFileSync } from "node:fs";
import addFormats from "ajv-formats";
import { SOURCE_DIR } from "../.config/webpack/constants.mts";

const DIST_DIR = "dist";

const pluginJson = JSON.parse(
	readFileSync("src/plugin.json", { encoding: "utf-8" }),
);

import packageJson from "../package.json" with { type: "json" };

const dist = `${DIST_DIR}/`;

const ajv = new Ajv({
	code: { source: true },
	strictTypes: false,
	allowUnionTypes: true,
	formats: { "color-hex": true },
});
addFormats(ajv);
function buildValidator(path: string) {
	const s = readFileSync(path, { encoding: "utf-8" });
	const obj = JSON.parse(s);
	const validator = ajv.compile(obj);
	const moduleSource = standaloneCode(ajv, validator);
	return moduleSource;
}

const ajvCompilerPlugin: esbuild.Plugin = {
	name: "ajvCompile",
	setup(build) {
		build.onLoad({ filter: /.*.json/ }, (args) => {
			if (args.with?.type === "ajv") {
				return {
					contents: buildValidator(args.path),
				} as esbuild.OnLoadResult;
			}
			return null;
		});
	},
};

type CopyReplacePluginArgs = {
	from: string;
	to: string;
	patterns: [RegExp, string][];
};
function copyReplacePlugin(args: CopyReplacePluginArgs): esbuild.Plugin {
	return {
		name: "replaceInPluginJson",
		setup(build) {
			build.onStart(() => {
				console.log("yo");
				let source = readFileSync(args.from, "utf-8");
				for (const [pat, repl] of args.patterns) {
					source = source.replaceAll(pat, repl);
				}
				writeFileSync(args.to, source);
			});
		},
	};
}

const now = new Date();
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
	encoding: "utf-8",
}).trim();
console.dir({ commit });
await esbuild.build({
	sourceRoot: SOURCE_DIR,
	entryPoints: ["module.js"],
	outdir: DIST_DIR,
	publicPath: `public/plugins/${pluginJson.id}`,
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
		"angular",
		"@grafana/ui",
		"@grafana/runtime",
		"@grafana/data",
	],
	loader: {
		".png": "copy",
		".svg": "copy",
		".woff2": "copy",
	},
	bundle: true,
	format: "cjs",
	plugins: [
		ajvCompilerPlugin,
		copy({
			assets: [
				{ from: "README.md", to: "README.md" },
				{ from: "CHANGELOG.md", to: "CHANGELOG.md" },
				{ from: "LICENSE", to: "LICENSE" },
				{ from: `${SOURCE_DIR}/img/**/*`, to: "img" },
			],
		}),
		copyReplacePlugin({
			from: `${SOURCE_DIR}/plugin.json`,
			to: `${DIST_DIR}/plugin.json`,
			patterns: [
				[/%VERSION%/g, packageJson.version],
				[/%TODAY%/g, now.toISOString().substring(0, 10)],
				[/%PLUGIN_ID%/g, pluginJson.id],
				[/%COMMIT%/g, commit],
				[/"%TIMESTAMP%"/g, (now.getTime() / 1000).toFixed(0)],
			],
		}),
	],
});
