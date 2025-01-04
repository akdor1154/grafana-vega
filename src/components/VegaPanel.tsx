import { css, cx } from "@emotion/css";
import {
	type DataFrame,
	type Field,
	FieldType,
	type PanelProps,
} from "@grafana/data";
import { PanelDataErrorView } from "@grafana/runtime";
import { useStyles2, useTheme2 } from "@grafana/ui";
import {
	type DataType,
	type Table,
	TimeUnit,
	bool,
	dictionary,
	float64,
	tableFromArrays,
	timestamp,
	utf8,
} from "@uwdata/flechette";
// biome-ignore lint/style/useImportType: <explanation>
import React, {
	FC,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import type { Options } from "types";
import * as vega from "vega";
import * as vegaLite from "vega-lite";
import * as vegaThemes from "vega-themes";
import * as vegaTooltip from "vega-tooltip";

interface Props extends PanelProps<Options> {}

const getStyles = () => {
	return {
		wrapper: css`
      font-family: Open Sans;
      position: relative;
    `,
		svg: css`
      position: absolute;
      top: 0;
      left: 0;
    `,
		textBox: css`
      position: absolute;
      bottom: 0;
      left: 0;
      padding: 10px;
    `,
	};
};

function arrowFieldType(f: Field): DataType | undefined {
	switch (f.type) {
		case FieldType.boolean:
			return bool();
		case FieldType.enum:
			return dictionary(utf8());
		case FieldType.frame:
			return undefined; // TODO
		case FieldType.geo:
			return undefined; // TODO
		case FieldType.nestedFrames:
			return undefined; // TODO
		case FieldType.number:
			return float64(); // js..
		case FieldType.other:
			return undefined; // TODO
		case FieldType.string:
			return utf8();
		case FieldType.time:
			return timestamp(TimeUnit.MILLISECOND);
		case FieldType.trace:
			return undefined; // TODO
		default: {
			const _: never = f.type;
			throw new Error("unreachable");
		}
	}
}

function _toArrow(data: DataFrame) {
	const df = tableFromArrays(
		Object.fromEntries(data.fields.map((f) => [f.name, f.values])),
		{
			types: Object.fromEntries(
				data.fields
					.map((f) => [f.name, arrowFieldType(f)] as const)
					.filter((kv): kv is [string, DataType] => !!kv[1]),
			),
		},
	);
	return df;
}

export const SimplePanel: React.FC<Props> = ({
	options,
	data,
	width,
	height,
	fieldConfig,
	id,
}) => {
	const theme = useTheme2();
	const styles = useStyles2(getStyles);

	if (data.series.length === 0) {
		return (
			<PanelDataErrorView
				fieldConfig={fieldConfig}
				panelId={id}
				data={data}
				needsStringField
			/>
		);
	}

	const toArrow = useCallback(_toArrow, []);
	const vegaData = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const s of data.series) {
			if (!s.refId) {
				console.warn("unnamed dataframe, can't use from vega");
				continue;
			}
			counts[s.refId] = (counts[s.refId] ?? 0) + 1;
		}
		const dupes = Object.entries(counts).filter(([k, v]) => v > 1);
		if (dupes.length > 0) {
			console.warn(
				"some dataframes have the same refId, only the last will be visible from vega",
				dupes,
			);
		}
		return Object.fromEntries(data.series.map((s) => [s.refId, toArrow(s)]));
	}, [data.series, toArrow]);
	const datasetNames = data.series
		.map((s) => s.name ?? s.refId)
		.filter((s): s is string => !!s);

	// biome-ignore lint/correctness/useExhaustiveDependencies: using json.stringify
	const SpecChart = useMemo(() => {
		let parsedSpec: vegaLite.TopLevelSpec | null;
		try {
			parsedSpec = JSON.parse(options.vegaSpec.parsedSpec || "");
		} catch {
			parsedSpec = null;
		}

		const config: vega.Config & vegaLite.Config = theme.isDark
			? (vegaThemes.dark as vega.Config & vegaLite.Config)
			: {};
		config.background = "transparent";
		const tooltipConfig: vegaTooltip.Options = {
			theme: theme.isDark ? "dark" : "light",
		};

		return MakeVegaChart(parsedSpec, config, tooltipConfig, datasetNames);
	}, [options.vegaSpec.parsedSpec, theme, JSON.stringify(datasetNames)]);

	return (
		<div
			className={cx(
				styles.wrapper,
				css`
          width: ${width}px;
          height: ${height}px;
        `,
			)}
		>
			<SpecChart data={vegaData} />
		</div>
	);
};

type VegaChartProps = {
	data: { [k: string]: Table };
};

function MakeVegaChart(
	spec: vegaLite.TopLevelSpec | null,
	config: vega.Config & vegaLite.Config,
	tooltipConfig: vegaTooltip.Options,
	datasetNames: string[],
) {
	let vgSpec: vega.Spec;
	let runtime: vega.Runtime;
	if (spec) {
		spec.datasets = Object.fromEntries(datasetNames.map((s) => [s, {}]));
	}
	try {
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		vgSpec = vegaLite.compile(spec!, { config }).spec;
		runtime = vega.parse(vgSpec, config);
	} catch (e) {
		console.error(e);
		return function DeadVegaChart({ data }: VegaChartProps) {
			return <div className="error">bung spec!</div>;
		};
	}
	const tooltip = new vegaTooltip.Handler(tooltipConfig);

	return function VegaChart({ data }: VegaChartProps) {
		const ref = useRef<HTMLDivElement | null>(null);
		const embed = useRef<vega.View | null>(null);

		// biome-ignore lint/correctness/useExhaustiveDependencies: ref.current is correct here?
		useLayoutEffect(
			function onMount() {
				if (!ref.current) {
					return;
				}

				// resizing
				const resizeObserver = new ResizeObserver((entries) => {
					requestAnimationFrame((d) => {
						if (!embed.current || !ref.current) {
							return;
						}
						// this is the only way to get vega to resize. It is actually listening
						// on window as well, not the element, hence the bubbles.
						ref.current.dispatchEvent(new Event("resize", { bubbles: true }));
					});
				});
				resizeObserver.observe(ref.current);

				// init the view
				const view = new vega.View(runtime, {
					container: ref.current,
					renderer: "hybrid",
					hover: true,
					tooltip: tooltip.call,
				});
				view.run();
				embed.current = view;

				return function cleanup() {
					view.finalize();
					resizeObserver.disconnect();
					embed.current = null;
				};
			},
			[ref.current],
		);

		// biome-ignore lint/correctness/useExhaustiveDependencies: embed.current is correct here?
		useEffect(
			function updateData() {
				if (!embed.current) {
					return;
				}
				for (const [name, df] of Object.entries(data)) {
					try {
						embed.current.data(name, df.toArray());
					} catch (e) {
						// this is reasonably common when we add/remove queries.
					}
				}
				embed.current.resize();
				embed.current.runAsync();
			},
			[embed.current, data],
		);

		return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
	} satisfies FC<VegaChartProps>;
}