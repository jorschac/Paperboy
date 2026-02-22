# Market Boy Agent

## Key Constraints

1. No Bloomberg integration.
2. No local ML/NLP models.
3. Sentiment values are directly consumed from API response fields.
4. Free-tier rate limits can impact response completeness.

## Environment setup

Before running any `node` command, You must:

1. Ensure Node.js `v20+` is installed.
2. Make sure you have these two variables set up temporarily in your current session (Use project-root as reports path, not `.agents`, for all generated files):

   - `TODAY_DATE=$(date +%F)`
   - `OUT_PATH="/Users/han/codex_projetcs/market_boy/reports/${TODAY_DATE}/news_fetch_data"`

   **example**

   ```sh
    TODAY_DATE=$(date +%F) && OUT_PATH="../../../reports/${TODAY_DATE}/news_fetch_data" && node scripts/fetch_market_data.js --out "$OUT_PATH"
   ```

## Output Schemas

### market_snapshot

1. `ts_utc`
2. `symbol`
3. `asset_class`
4. `price`
5. `change_pct`
6. `change`
7. `volume`
8. `high`
9. `low`
10. `previous_close`
11. `source`

### macro_snapshot

1. `ts_utc`
2. `symbol`
3. `asset_class`
4. `price`
5. `change_pct`
6. `change`
7. `volume`
8. `high`
9. `low`
10. `previous_close`
11. `source`

### news_sentiment

1. `ts_utc`
2. `ticker`
3. `title`
4. `source`
5. `url`
6. `time_published`
7. `overall_sentiment_score`
8. `overall_sentiment_label`
9. `relevance_score`
10. `topic`

### calendar_3w

1. `event_time_utc`
2. `currency`
3. `event`
4. `actual`
5. `previous`
6. `consensus`
7. `source`
