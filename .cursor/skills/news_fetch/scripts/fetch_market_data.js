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

  if(!outDir) {
    throw new Error("Output directory is required");
  }

  const apiKey = requireEnv("ALPHAVANTAGE_API_KEY");
  const stockSymbols = splitCsvEnv(
    "MARKET_SYMBOLS",
    "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA",
  );
  const metalSymbols = splitCsvEnv("METALS_SYMBOLS", "XAUUSD,XAGUSD");

  if(!stockSymbols.length && !metalSymbols.length) {
    throw new Error(" Stock and metal symbol are both required from environment");
  }

  if(!apiKey) {
    throw new Error("Alpha Vantage API key is required from environment");
  }

  const rows = [];
  const ts = toIsoUtc();

  for (const symbol of stockSymbols) {
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "GLOBAL_QUOTE");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", apiKey);
    const data = await fetchJsonWithRetry(url.toString());
    console.log('这三小？', {note: data.Note, error: data["Error Message"], quote: data["Global Quote"], link: url.toString(), data}, '\n\n')
    if (data.Note || data["Error Message"]) continue;
    const q = data["Global Quote"] || {};
    rows.push({
      ts_utc: ts,
      symbol,
      asset_class: "equity",
      price: q["05. price"] ?? "",
      change_pct: q["10. change percent"] ?? "",
      change: q["09. change"] ?? "",
      volume: q["06. volume"] ?? "",
      high: q["03. high"] ?? "",
      low: q["04. low"] ?? "",
      previous_close: q["08. previous close"] ?? "",
      source: "alpha_vantage",
    });
  }

  for (const pair of metalSymbols) {
    const from = pair.slice(0, 3).toUpperCase();
    const to = pair.slice(3).toUpperCase() || "USD";
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "CURRENCY_EXCHANGE_RATE");
    url.searchParams.set("from_currency", from);
    url.searchParams.set("to_currency", to);
    url.searchParams.set("apikey", apiKey);
    const data = await fetchJsonWithRetry(url.toString());
    if (data.Note || data["Error Message"]) continue;
    const fx = data["Realtime Currency Exchange Rate"] || {};
    rows.push({
      ts_utc: ts,
      symbol: `${from}${to}`,
      asset_class: "metal",
      price: fx["5. Exchange Rate"] ?? "",
      change_pct: "",
      change: "",
      volume: "",
      high: "",
      low: "",
      previous_close: "",
      source: "alpha_vantage",
    });
  }

  const headers = ["ts_utc", "symbol", "asset_class", "price", "change_pct", "change", "volume", "high", "low", "previous_close", "source"];
  const written = await writeJsonAndCsv(outDir, "market_snapshot", rows, headers);
  console.log(
    `Wrote ${rows.length} rows to ${written.csvPath} and ${written.jsonPath}`,
  );
}

main().catch((err) => {
  console.error(`fetch_market_data failed: ${err.message}`);
  process.exit(1);
});
