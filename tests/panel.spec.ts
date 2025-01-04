import { expect, test } from "@grafana/plugin-e2e";

test('should display "No data" in case panel data is empty', async ({
	gotoPanelEditPage,
	readProvisionedDashboard,
}) => {
	const dashboard = await readProvisionedDashboard({
		fileName: "dashboard.json",
	});
	const panelEditPage = await gotoPanelEditPage({ dashboard, id: "2" });
	await expect(panelEditPage.panel.locator).toContainText("No data");
});

test("should display a graph when a spec is set", async ({
	panelEditPage,
	readProvisionedDataSource,
	page,
	selectors,
}) => {
	const ds = await readProvisionedDataSource({ fileName: "datasources.yml" });
	// TODO: this doesn't work either.. CSV would be better (see below) but I'll take anything at this point.
	await panelEditPage.mockQueryDataResponse({
		results: {
			A: {
				status: 200,
				frames: [
					{
						schema: {
							refId: "A",
							fields: [
								{
									name: "time",
									type: "time",
									typeInfo: { frame: "time.Time", nullable: true },
								},
								{
									name: "some_value",
									type: "number",
									typeInfo: { frame: "number", nullable: true },
								},
							],
						},
						data: {
							values: [
								[
									new Date("2024-01-01T00:00:00Z"),
									new Date("2024-01-01T00:00:01Z"),
									new Date("2024-01-01T00:00:02Z"),
									new Date("2024-01-01T00:00:03Z"),
									new Date("2024-01-01T00:00:04Z"),
									new Date("2024-01-01T00:00:05Z"),
									new Date("2024-01-01T00:00:06Z"),
									new Date("2024-01-01T00:00:07Z"),
									new Date("2024-01-01T00:00:08Z"),
									new Date("2024-01-01T00:00:09Z"),
								],
								[0, 1, 2, 3, 4, 5, 4, 3, 2, 1],
							],
						},
					},
				],
			},
		},
	});
	await panelEditPage.datasource.set(ds.name);
	await panelEditPage.setVisualization("Vega");
	// await panelEditPage.refreshPanel();

	// TODO: dump in CSV data here, I give up trying to reverse engineer the UI
	// await panelEditPage.getByGrafanaSelector(
	// 	selectors.components.DataSource.TestData.QueryTab.scenarioSelectContainer
	// ).click()
	// await page.keyboard.type("CSV Content");

	const specEditor = await panelEditPage
		.getByGrafanaSelector(
			selectors.components.PanelEditor.OptionsPane.fieldLabel("Vega Vega Spec"),
		)
		.locator(".monaco-editor")
		.nth(0);
	await specEditor.click();
	await page.keyboard.type(
		JSON.stringify({
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
		}),
	);

	await expect(page.getByTestId("vega-panel")).toBeVisible();
	// TODO: once we can input a CSV above, do a snapshot test.
});
