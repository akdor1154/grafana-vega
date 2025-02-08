import { readFileSync, writeFileSync } from "node:fs";
import path, { basename } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone";

import vegaLiteSchema from "vega-lite/build/vega-lite-schema.json";
import vegaSchema from "vega/build/vega-schema.json";

const outBase = "src/codegen";

function codegen() {
	const ajv = new Ajv({
		schemas: [
			{
				...vegaLiteSchema,
				$id: "https://vega.github.io/schema/vega-lite/v5.json",
			},
			{
				...vegaSchema,
				$id: "https://vega.github.io/schema/vega/v5.json",
			},
		],
		code: {
			source: true,
			esm: true,
			lines: true,
			// formats: _`formats")`,
		},
		strictTypes: false,
		allowUnionTypes: true,
		formats: { "color-hex": true },
	});

	addFormats(ajv);

	function buildValidator(): string {
		let moduleSource = standaloneCode(ajv, {
			vega: "https://vega.github.io/schema/vega/v5.json",
			vegaLite: "https://vega.github.io/schema/vega-lite/v5.json",
		});

		// ajv says "ESM" then goes and dumps requires everywhere anyway.
		// we'll fix them up.
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

		moduleSource = `"use strict"\n${importString}${moduleSource}`;
		return moduleSource;
	}

	const validatorSrc = buildValidator();

	writeFileSync(path.join(outBase, "validator.mjs"), validatorSrc);
	const dts = `
import { type ValidateFunction } from "ajv";
export const vega: ValidateFunction;
export const vegaLite: ValidateFunction;
`;

	writeFileSync(path.join(outBase, "validator.d.ts"), dts);
}
codegen();
