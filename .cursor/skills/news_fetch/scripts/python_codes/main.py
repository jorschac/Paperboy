import argparse
import csv
import json
import os
import sys
import talib
from curl_cffi import requests
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

STOCK_SYMBOLS_DEFAULT = "AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA"
METALS_SYMBOLS_DEFAULT = "XAUUSD,XAGUSD"

METAL_TICKER_MAP = {
    "XAUUSD": "GC=F",
    "XAGUSD": "SI=F",
}

HEADERS = [
    "ts_utc", "symbol", "asset_class", "price", "change_pct",
    "change", "volume", "high", "low", "previous_close", "source",
    # options fields (equity only)
    "options_expiry", "atm_iv_pct", "put_call_ratio", "top_oi_strikes",
]


def load_env(skill_dir: Path):
    for name in (".env", ".env.example"):
        env_file = skill_dir / name
        if not env_file.exists():
            continue
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))
        return


def to_iso_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fmt(val, decimals: int = 4) -> str:
    if val is None:
        return ""
    try:
        v = float(val)
        if v != v:  # NaN check
            return ""
        return str(round(v, decimals))
    except (TypeError, ValueError):
        return ""


def write_json_and_csv(out_dir: str, name: str, rows: list) -> tuple[str, str]:
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    json_path = os.path.join(out_dir, f"{name}.json")
    csv_path = os.path.join(out_dir, f"{name}.csv")
    with open(json_path, "w") as f:
        json.dump(rows, f, indent=2)
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=HEADERS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    return json_path, csv_path


def make_session() -> requests.Session:
    proxy = (
        os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY") or
        os.environ.get("http_proxy")  or os.environ.get("HTTP_PROXY")
    )
    return requests.Session(
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"},
        proxy='http://127.0.0.1:7897',
        impersonate="chrome",
    )


def fetch_options_summary(ticker: yf.Ticker, current_price: float) -> dict:
    """
    Fetch near-term options chain and return:
      - options_expiry:  expiry date used
      - atm_iv_pct:      near-ATM implied volatility % (avg of call + put at closest strike)
      - put_call_ratio:  total put volume / total call volume
      - top_oi_strikes:  top 3 strikes by combined open interest (support/resistance proxy)
    Only uses the nearest expiry to keep requests minimal.
    """
    try:
        expirations = ticker.options
        if not expirations:
            return {}

        exp = expirations[0]  # nearest expiry
        chain = ticker.option_chain(exp)
        calls, puts = chain.calls, chain.puts

        if calls is None or puts is None or calls.empty or puts.empty:
            return {}

        # ATM IV: strike closest to current price
        atm_strike = calls.iloc[(calls["strike"] - current_price).abs().argsort()[:1]]["strike"].values[0]
        call_iv = calls.loc[calls["strike"] == atm_strike, "impliedVolatility"].values
        put_iv  = puts.loc[puts["strike"]  == atm_strike, "impliedVolatility"].values
        if call_iv.size and put_iv.size:
            atm_iv_pct = round(float(call_iv[0] + put_iv[0]) / 2 * 100, 2)
        else:
            atm_iv_pct = None

        # Put/Call ratio by volume
        call_vol = calls["volume"].fillna(0).sum()
        put_vol  = puts["volume"].fillna(0).sum()
        pc_ratio = round(put_vol / call_vol, 4) if call_vol > 0 else None

        # Top 3 strikes by combined open interest
        combined_oi = (
            pd.concat([
                calls[["strike", "openInterest"]],
                puts[["strike", "openInterest"]],
            ])
            .groupby("strike")["openInterest"]
            .sum()
            .sort_values(ascending=False)
            .head(3)
            .reset_index()
        )
        top_oi_strikes = [
            {"strike": float(r["strike"]), "open_interest": int(r["openInterest"])}
            for _, r in combined_oi.iterrows()
        ]

        return {
            "options_expiry":  exp,
            "atm_iv_pct":      fmt(atm_iv_pct, 2),
            "put_call_ratio":  fmt(pc_ratio, 4),
            "top_oi_strikes":  json.dumps(top_oi_strikes),
        }

    except Exception as e:
        print(f"    [options WARN] {e}", file=sys.stderr)
        return {}


def fetch_batch(symbols: list[str], asset_class: str, symbol_map: dict[str, str], ts: str) -> list[dict]:
    """Fetch real-time quotes + options summary (equity only) via yf.Ticker."""
    if not symbols:
        return []

    session = make_session()
    rows = []

    for sym in symbols:
        yf_sym = symbol_map.get(sym.upper(), sym)
        try:
            ticker = yf.Ticker(yf_sym, session=session)
            info   = ticker.fast_info
            price  = info.last_price
            prev   = info.previous_close
            if price is None or price != price:
                raise ValueError("last_price is None/NaN")

            change     = round(price - prev, 4) if prev else None
            change_pct = f"{round(change / prev * 100, 4)}%" if (prev and change is not None) else ""

            row = {
                "ts_utc":         ts,
                "symbol":         sym.upper(),
                "asset_class":    asset_class,
                "price":          fmt(price),
                "change_pct":     change_pct,
                "change":         fmt(change),
                "volume":         fmt(info.last_volume or info.three_month_average_volume, 0),
                "high":           fmt(info.day_high),
                "low":            fmt(info.day_low),
                "previous_close": fmt(prev),
                "source":         "yfinance",
                # options fields default empty
                "options_expiry": "",
                "atm_iv_pct":     "",
                "put_call_ratio": "",
                "top_oi_strikes": "",
            }

            # options are only available for equities
            if asset_class == "equity":
                opts = fetch_options_summary(ticker, price)
                row.update(opts)

            rows.append(row)
            iv_hint = f"  IV={row['atm_iv_pct']}%  P/C={row['put_call_ratio']}" if row["atm_iv_pct"] else ""
            print(f"  ✓ {sym}: ${fmt(price)} ({change_pct}){iv_hint}")

        except Exception as e:
            print(f"  ✗ {sym}: {e}", file=sys.stderr)

    return rows


def main():
    parser = argparse.ArgumentParser(description="Fetch market snapshot via yfinance")
    parser.add_argument("--out", required=True, help="Output directory path")
    args = parser.parse_args()

    skill_dir = Path(__file__).resolve().parent.parent.parent
    load_env(skill_dir)

    stock_symbols = [
        s.strip()
        for s in os.environ.get("MARKET_SYMBOLS", STOCK_SYMBOLS_DEFAULT).split(",")
        if s.strip()
    ]
    metal_symbols = [
        s.strip()
        for s in os.environ.get("METALS_SYMBOLS", METALS_SYMBOLS_DEFAULT).split(",")
        if s.strip()
    ]

    ts = to_iso_utc()
    rows = []

    print(f"Fetching {len(stock_symbols)} stocks: {', '.join(stock_symbols)}")
    rows += fetch_batch(stock_symbols, "equity", {}, ts)

    print(f"Fetching {len(metal_symbols)} metals: {', '.join(metal_symbols)}")
    rows += fetch_batch(metal_symbols, "metal", METAL_TICKER_MAP, ts)

    json_path, csv_path = write_json_and_csv(args.out, "market_snapshot", rows)
    print(f"Wrote {len(rows)} rows to {csv_path}\n                  {json_path}")


if __name__ == "__main__":
    main()
