import { PanelPlugin } from "@grafana/data";
import type { TopLevelSpec } from "vega-lite";
import { SimplePanel } from "./components/VegaPanel";
import { CodeEditorOption, JSONC_PARSE_OPTS } from "./panel/CodeEditor";
import type { Options } from "./types";

import * as jsonc from "jsonc-parser";
import React from "react";
import { description } from "./panel/description";

export const plugin = new PanelPlugin<Options>(SimplePanel).setPanelOptions(
	(builder) => {
		return builder.addCustomEditor({
			id: "spec",
			path: "vegaSpec",
			name: "Specification",
			editor: CodeEditorOption,
			// @ts-ignore - hey grafana guys, I just want to include a link here.. any sanctioned way to do so?
			description: description as string,
			defaultValue: {
				parsedSpec: {
					text: jsonc.parse(defaultBarText, [], JSONC_PARSE_OPTS),
					mode: "vega-lite",
				},
				text: defaultBarText,
			} satisfies Options["vegaSpec"],
			settings: {},
		});
	},
);

const defaultBarText = `
{
	"$schema": "https://vega.github.io/schema/vega-lite/v5.json",
	"data": {
		// specify which dataset you want to plot here.
		// Alt+Space should give you autocomplete.
		"name": "A",
	},
	"mark": { "type": "circle", "tooltip": { "content": "data" } },
	"width": "container",
	"height": "container",
	"encoding": {
		"x": {
			// you can autocomplete field names with
			// Alt+Space too.
			"field": "time",
			"type": "temporal",
		},
		"y": {
			"field": "some_value",
			"type": "quantitative",
		},
	},
}
`;
