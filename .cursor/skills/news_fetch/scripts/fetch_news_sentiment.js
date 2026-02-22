import {
  fetchJsonWithRetry,
  loadLocalEnv,
  parseArgs,
  requireEnv,
  splitCsvEnv,
  toIsoUtc,
  writeJsonAndCsv,
  addNextNewsSentiment,
} from "./common.js";

async function main() {
  await loadLocalEnv();
  const args = parseArgs(process.argv);
  const outDir = args.out || "data";
  const days = Number(args.days || 7);

  const apiKey = requireEnv("ALPHAVANTAGE_API_KEY");
  const symbols = splitCsvEnv(
    "MARKET_SYMBOLS",
    "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA",
  );
  const now = new Date();
  const past = new Date(now);
  past.setUTCDate(now.getUTCDate() - days);
  const timeFrom = toAvTime(past);
  const timeTo = toAvTime(now);

  const rows = [];
  const dedupe = new Set();
  const MAX_NEWS = 20;

  // Alpha Vantage multi-ticker query is AND semantics.
  // Query per ticker to get broader coverage, then de-duplicate.
  for (const symbol of symbols) {
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "NEWS_SENTIMENT");
    url.searchParams.set("tickers", symbol);
    url.searchParams.set("time_from", timeFrom);
    url.searchParams.set("time_to", timeTo);
    url.searchParams.set("sort", "RELEVANCE");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("apikey", apiKey);

    const data = await fetchJsonWithRetry(url.toString());
    if (data.Note || data["Error Message"]) {
      throw new Error(`${symbol}: ${data.Note || data["Error Message"]}`);
    }

    const feed = Array.isArray(data.feed) ? data.feed : [];
    const mergePool = [];
    for (const item of feed) {
      // console.log('item 是啥？？\n\n ======= \n', item, '\n\n ======= \n')
      const key = `${symbol}|${item.url ?? ""}|${item.time_published ?? ""}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      addNextNewsSentiment(mergePool, { symbol, ...item }, MAX_NEWS);
    }
    rows.push(...mergePool);
  }

  const headers = [
    "ts_utc",
    "ticker",
    "title",
    "source",
    "url",
    "time_published",
    "overall_sentiment_score",
    "overall_sentiment_label",
    "relevance_score",
    "summary",
    "topic",
  ];
  const written = await writeJsonAndCsv(
    outDir,
    "news_sentiment",
    rows,
    headers,
  );
  console.log(
    `Wrote ${rows.length} rows to ${written.csvPath} and ${written.jsonPath}`,
  );
}

function toAvTime(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${day}T${hh}${mm}`;
}

main().catch((err) => {
  console.error(`fetch_news_sentiment failed: ${err.message}`);
  process.exit(1);
});
