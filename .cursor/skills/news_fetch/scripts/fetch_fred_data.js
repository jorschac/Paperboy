import {
  fetchJsonWithRetry,
  loadLocalEnv,
  parseArgs,
  requireEnv,
  splitCsvEnv,
  toIsoUtc,
  writeJsonAndCsv,
} from "./common.js";

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv);
  const outDir = args.out || "data";

  const apiKey = requireEnv("FRED_API_KEY");
  const seriesList = splitCsvEnv("FRED_SERIES", "FEDFUNDS,CPIAUCSL,UNRATE,DGS10");
  const rows = [];

  for (const seriesId of seriesList) {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "50");

    const data = await fetchJsonWithRetry(url.toString());
    const observations = Array.isArray(data.observations) ? data.observations : [];
    const valid = observations.find((o) => o && o.value && o.value !== ".");
    rows.push({
      ts_utc: toIsoUtc(),
      series_id: seriesId,
      value: valid?.value ?? "",
      date: valid?.date ?? "",
      source: "fred",
    });
  }

  const headers = ["ts_utc", "series_id", "value", "date", "source"];
  const written = await writeJsonAndCsv(outDir, "macro_snapshot", rows, headers);
  console.log(
    `Wrote ${rows.length} rows to ${written.csvPath} and ${written.jsonPath}`,
  );
}

main().catch((err) => {
  console.error(`fetch_fred_data failed: ${err.message}`);
  process.exit(1);
});
