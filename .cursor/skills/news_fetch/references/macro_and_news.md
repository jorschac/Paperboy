# Overview

Collect market, macro, and news sentiment data through APIs only, then export CSV and JSON outputs for downstream dashboards or strategy logic.

### API Key Reminder

If a key is missing, the related script exits with a clear error message.
Scripts auto-load `.env` (or fallback `.env.example`) from the skill directory.

### Workflow

Run scripts with `Bash` subagent in parallel, which means you can generate 3 background subagents to run these scripts all at once:

1. `cd /Users/han/codex_projetcs/market_boy/.cursor/skills/news_fetch && TODAY_DATE=$(date +%F) && OUT_PATH="/Users/han/codex_projetcs/market_boy/reports/${TODAY_DATE}/news_fetch_data" && source scripts/python_codes/.venv/bin/activate && python scripts/python_codes/main.py --out "$OUT_PATH"`
2. `cd /Users/han/codex_projetcs/market_boy/.cursor/skills/news_fetch && TODAY_DATE=$(date +%F) && OUT_PATH="../../../reports/${TODAY_DATE}/news_fetch_data" && node scripts/fetch_fred_data.js --out "$OUT_PATH"`
3. `cd /Users/han/codex_projetcs/market_boy/.cursor/skills/news_fetch && TODAY_DATE=$(date +%F) && OUT_PATH="../../../reports/${TODAY_DATE}/news_fetch_data" && node scripts/fetch_news_sentiment.js --out "$OUT_PATH" --days 3`

### Outputs

Default output location in this repo:

1. `MARKET_BOY/reports/${TODAY_DATE}/news_fetch_data/market_snapshot.json`
2. `MARKET_BOY/reports/${TODAY_DATE}/news_fetch_data/macro_snapshot.json`
3. `MARKET_BOY/reports/${TODAY_DATE}/news_fetch_data/news_sentiment.json`

### Data Source Notes

1. News sentiment is taken directly from API fields (no local NLP/model inference).
2. Alpha Vantage `tickers=A,B` uses AND semantics. This skill queries each ticker separately and deduplicates.
3. Free-tier rate limits can cause partial results.
4. Trading Economics calendar requires a valid key; if unavailable, only that module fails.
