type SeriesSize = "sm" | "md" | "lg";

export interface SimpleOptions {
	text: string;
	showSeriesCount: boolean;
	seriesCountSize: SeriesSize;
}

export interface Options {
	vegaSpec: SpecValue;
}
export interface SpecValue {
	// I'd rather have this be the parsed JSON, but there's some WeIrD sHiT
	// going on in the grafana level when I do this - specifically, I get partially
	// stale properties deep in the spec even if I deeply Object.freeze()...
	// so let's pass around a giant string instead to protect it from this nonsense.
	parsedSpec: string | null;
	text: string;
}
