import { PanelPlugin } from "@grafana/data";
import { CodeEditorOption } from "panel/CodeEditor";
import { SimplePanel } from "./components/VegaPanel";
import type { Options } from "./types";

export const plugin = new PanelPlugin<Options>(SimplePanel).setPanelOptions(
	(builder) => {
		return builder.addCustomEditor({
			id: "spec",
			path: "vegaSpec",
			name: "Vega Spec",
			editor: CodeEditorOption,
			defaultValue: {
				parsedSpec: JSON.stringify(defaultBar),
				text: JSON.stringify(defaultBar, null, "\t"),
			} satisfies Options["vegaSpec"],
			settings: {},
		});
	},
);

const defaultBar = {
	$schema: "https://vega.github.io/schema/vega-lite/v5.json",
	data: {
		name: "A",
	},
	mark: { type: "circle", tooltip: { content: "data" } },
	width: "container",
	height: "container",
	encoding: {
		x: {
			field: "time",
			type: "temporal",
		},
		y: {
			field: "some_value",
			type: "quantitative",
		},
	},
};