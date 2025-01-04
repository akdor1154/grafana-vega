import type { StandardEditorContext, StandardEditorProps } from "@grafana/data";
import type { Monaco } from "@grafana/ui";
import { CodeEditor as GrafanaCodeEditor } from "@grafana/ui";
import type { JSONSchemaType, ValidateFunction } from "ajv";
import type { FC } from "react";
// biome-ignore lint/style/useImportType: <explanation>
import React, { useCallback, useEffect, useState } from "react";
import type { Options, SpecValue } from "types";

interface CodeEditorProps {
	settings?: CodeEditorOptionSettings;
	value: string | undefined;
	context: StandardEditorContext<Options, unknown>;
	onChange: (value: string) => void;
}

import vegaLiteSchema from "vega-lite/build/vega-lite-schema.json";
import vegaLiteSchemaAjv from "vega-lite/build/vega-lite-schema.json" with {
	type: "ajv",
};

vegaLiteSchema.definitions.Data;
const ajvParsers = {
	vegaLite: vegaLiteSchemaAjv as unknown as ValidateFunction<unknown>,
} satisfies Record<string, ValidateFunction>;

export const CodeEditor: FC<CodeEditorProps> = ({
	settings,
	value,
	context,
	onChange,
}) => {
	// we're going to modify this schema to sub in field names and ds names, so we want it
	// typed as a generic JSON schema instead of a literal JSON type.
	const [schema, setSchema] = useState(
		vegaLiteSchema as unknown as JSONSchemaType<{ [k: string]: unknown }>,
	);
	const [editor, setEditor] = useState<Monaco | null>(null);

	const fieldNames = context.data.flatMap((df) => df.fields).map((f) => f.name);
	const dataNames = context.data.map((df) => df.refId);

	// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
	useEffect(() => {
		const s = structuredClone(vegaLiteSchema) as unknown as typeof schema;

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
		setSchema(s);
	}, [JSON.stringify({ fieldNames, dataNames })]);

	async function editorDidMount(_: unknown, m: Monaco) {
		setEditor(m);
	}

	useEffect(() => {
		if (!editor) {
			return;
		}
		editor.languages.json.jsonDefaults.setDiagnosticsOptions({
			schemas: [
				{
					uri: "https://vega.github.io/schema/vega-lite/v5.json",
					fileMatch: ["*.json"],
					schema: schema,
				},
			],
		});
	}, [editor, schema]);

	return (
		<GrafanaCodeEditor
			height={"33vh"}
			value={value ?? ""}
			language="json"
			showLineNumbers={true}
			onEditorDidMount={editorDidMount}
			onSave={onChange}
			onBlur={onChange}
			monacoOptions={{ contextmenu: true }}
		/>
	);
};

export interface CodeEditorOptionSettings {
	onNewSpec: (spec: Record<string, unknown>) => void;
}

interface CodeEditorOptionProps
	extends StandardEditorProps<SpecValue, CodeEditorOptionSettings, Options> {}

export const CodeEditorOption: React.FC<CodeEditorOptionProps> = ({
	value,
	item,
	context,
	onChange,
}) => {
	const [errors, setErrors] = useState<string[]>([]);
	function _onNewText(value: string) {
		// biome-ignore lint/complexity/noBannedTypes: <explanation>
		let obj: {} | null;
		setErrors([]);
		try {
			obj = JSON.parse(value);
		} catch (e) {
			obj = null;
			setErrors([(e as Error).message]);
		}
		if (obj !== null) {
			const res = ajvParsers.vegaLite(obj);
			if (!res) {
				obj = null;
				setErrors(
					ajvParsers.vegaLite.errors
						?.map((e) => e.message)
						.filter((e): e is string => !!e) ?? [],
				);
			}
		}
		// as before - grafana does funny business if we send back raw obj here.
		const parsedSpec = obj ? JSON.stringify(obj) : null;
		onChange({ text: value, parsedSpec: parsedSpec });
	}
	const onNewText = useCallback(_onNewText, []);

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
