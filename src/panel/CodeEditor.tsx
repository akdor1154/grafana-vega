import type { StandardEditorContext, StandardEditorProps } from "@grafana/data";
import type { Monaco } from "@grafana/ui";
import { CodeEditor as GrafanaCodeEditor } from "@grafana/ui";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { FC } from "react";
// biome-ignore lint/style/useImportType: <explanation>
import React, { useCallback, useEffect, useState } from "react";
import type { Options, SPEC_MODE, SpecValue } from "types";
import vegaLiteSchema from "vega-lite/build/vega-lite-schema.json";
import vegaSchema from "vega/build/vega-schema.json";
import * as parsers from "../codegen/validator.mjs";

interface CodeEditorProps {
	settings?: CodeEditorOptionSettings;
	value: string | undefined;
	context: StandardEditorContext<Options, unknown>;
	onChange: (value: string) => void;
}

const VEGA_LITE_SCHEMA_ID = "https://vega.github.io/schema/vega-lite/v5.json";
const VEGA_SCHEMA_ID = "https://vega.github.io/schema/vega/v5.json";

export default function addMarkdownProps<T>(
	s: JSONSchemaType<{ [k: string]: unknown }>,
): void {
	if (s.description) {
		s.markdownDescription = s.description;
	}
	for (const key of Reflect.ownKeys(s)) {
		const subval = s[key as string];
		if (typeof subval === "object" && subval !== null) {
			addMarkdownProps(subval);
		}
	}
}

export const CodeEditor: FC<CodeEditorProps> = ({
	settings,
	value,
	context,
	onChange,
}) => {
	// we're going to modify this schema to sub in field names and ds names, so we want it
	// typed as a generic JSON schema instead of a literal JSON type.
	const [vlSchema, setVLSchema] = useState<JSONSchemaType<{
		[k: string]: unknown;
	}> | null>(null);
	const [vgSchema, setVGSchema] = useState<JSONSchemaType<{
		[k: string]: unknown;
	}> | null>(null);

	const [editor, setEditor] = useState<Monaco | null>(null);

	const fieldNames = context.data.flatMap((df) => df.fields).map((f) => f.name);
	const dataNames = context.data.map((df) => df.refId);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		const s = structuredClone(vegaLiteSchema) as unknown as Exclude<
			typeof vlSchema,
			null
		>;

		addMarkdownProps(s);

		// sub in field names and datasource names
		if (!s.definitions?.FieldName) {
			throw new Error("bad schema!");
		}
		// biome-ignore lint/style/noNonNullAssertion: checked above
		s.definitions!.FieldName = {
			anyOf: [{ type: "string" }, { type: "string", enum: fieldNames }],
		};
		if (!s.definitions?.NamedData.properties?.name) {
			throw new Error("bad schema!");
		}
		// biome-ignore lint/style/noNonNullAssertion: checked above
		s.definitions!.NamedData.properties.name = {
			description: s.definitions?.NamedData.properties.name.description,
			anyOf: [{ type: "string" }, { type: "string", enum: dataNames }],
		};
		setVLSchema(s);
	}, [JSON.stringify({ fieldNames, dataNames })]);

	useEffect(() => {
		const s = structuredClone(vegaSchema) as unknown as Exclude<
			typeof vgSchema,
			null
		>;
		addMarkdownProps(s);
		setVGSchema(s);
	}, []);

	async function editorDidMount(_: unknown, m: Monaco) {
		setEditor(m);
	}

	useEffect(() => {
		if (!editor || !vgSchema || !vlSchema) {
			return;
		}

		editor.languages.json.jsonDefaults.setDiagnosticsOptions({
			allowComments: true,
			trailingCommas: "ignore",
			enableSchemaRequest: false,
			schemas: [
				{
					uri: "https://vega.github.io/schema/vega-lite/v5.json",
					fileMatch: ["*.json"],
					schema: vlSchema,
				},
				{
					uri: "https://vega.github.io/schema/vega/v5.json",
					fileMatch: ["*.json"],
					schema: vgSchema,
				},
			],
		});
	}, [editor, vlSchema, vgSchema]);

	return (
		<GrafanaCodeEditor
			height={"33vh"}
			value={value ?? ""}
			language="json"
			showLineNumbers={true}
			onEditorDidMount={editorDidMount}
			onSave={onChange}
			onBlur={onChange}
			monacoOptions={{ contextmenu: true, formatOnPaste: true }}
		/>
	);
};

export interface CodeEditorOptionSettings {
	onNewSpec: (spec: Record<string, unknown>) => void;
}

interface CodeEditorOptionProps
	extends StandardEditorProps<SpecValue, CodeEditorOptionSettings, Options> {}

import * as jsonc from "jsonc-parser";

export const JSONC_PARSE_OPTS = {
	disallowComments: false,
	allowTrailingComma: true,
	allowEmptyContent: true,
};

function tryParseInput(
	value: string,
): [{ obj: object; mode: SPEC_MODE } | null, string[]] {
	let obj: { [k: string]: unknown };
	const errs: jsonc.ParseError[] = [];
	try {
		obj = jsonc.parse(value, errs, JSONC_PARSE_OPTS);
	} catch (e) {
		return [null, [(e as Error).message]];
	}
	if (errs.length > 0) {
		return [null, errs.map((e) => jsonc.printParseErrorCode(e.error))];
	}

	let validator: ValidateFunction<unknown>;
	let mode: SPEC_MODE;

	const schema = obj.$schema;
	if (schema === VEGA_LITE_SCHEMA_ID) {
		validator = parsers.vegaLite;
		mode = "vega-lite";
	} else if (schema === VEGA_SCHEMA_ID) {
		validator = parsers.vega;
		mode = "vega";
	} else {
		return [
			null,
			[
				`You need to set $schema=${VEGA_LITE_SCHEMA_ID} or $schema=${VEGA_SCHEMA_ID} in your spec.`,
			],
		];
	}

	const res = validator(obj);
	if (!res) {
		const errors =
			validator.errors?.map((e) => e.message).filter((e): e is string => !!e) ??
			[];
		return [null, errors];
	}

	return [{ obj, mode }, []];
}

export const CodeEditorOption: React.FC<CodeEditorOptionProps> = ({
	value,
	item,
	context,
	onChange,
}) => {
	const [errors, setErrors] = useState<string[]>([]);
	function _onNewText(value: string) {
		const [res, errors] = tryParseInput(value);
		setErrors(errors);
		// as before - grafana does funny business if we send back raw obj here.
		const parsedSpec = res
			? { text: JSON.stringify(res.obj), mode: res.mode }
			: null;
		onChange({ text: value, parsedSpec: parsedSpec });
	}
	const onNewText = useCallback(_onNewText, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		onNewText(value.text);
	}, []);

	return (
		<div>
			<CodeEditor
				settings={item.settings}
				value={value.text}
				context={context}
				onChange={onNewText}
			/>
			{errors.map((e, i) => (
				<div key={e} className="error">
					{e}
				</div>
			))}
		</div>
	);
};
