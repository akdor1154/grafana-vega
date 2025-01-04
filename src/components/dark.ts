import type { Config as VgConfig } from "vega";
import type { Config as VlConfig } from "vega-lite";

type Config = VgConfig | VlConfig;

const gentleLight = "#bbb";
const lightColor = "#fff";
const subtle = "#444";

const darkTheme: Config = {
	background: "#333",

	view: {
		stroke: subtle,
	},

	title: {
		color: lightColor,
		subtitleColor: lightColor,
	},

	style: {
		"guide-label": {
			fill: lightColor,
		},
		"guide-title": {
			fill: lightColor,
		},
	},

	axis: {
		domainColor: gentleLight,
		gridColor: subtle,
		tickColor: gentleLight,
	},
};

export default darkTheme;
