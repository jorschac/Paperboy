import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    i += 1;
  }
  return result;
}

export function splitCsvEnv(name, fallback = "") {
  const raw = process.env[name] ?? fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing ${name}. Leave keys blank in template, then apply and fill real keys in .env before running.`,
    );
  }
  return value.trim();
}

export async function loadLocalEnv(cwd = process.cwd()) {
  const candidates = [path.join(cwd, ".env"), path.join(cwd, ".env.example")];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    return filePath;
  }
  return null;
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export function toIsoUtc(input = new Date()) {
  return new Date(input).toISOString();
}

export function addDays(dateIso, days) {
  const d = new Date(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function fetchJsonWithRetry(url, options = {}, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const data = await res.json();
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      console.error(
        `Error fetching ${url}: ${err.message}. Retrying... Left ${retries - attempt} attempts`,
      );
      await wait(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toCsv(rows, headers) {
  const esc = (v) => {
    const text = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export async function writeJsonAndCsv(outDir, baseName, rows, headers) {
  await ensureDir(outDir);
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const csvPath = path.join(outDir, `${baseName}.csv`);
  await writeFile(jsonPath, JSON.stringify(rows, null, 2), "utf8");
  await writeFile(csvPath, toCsv(rows, headers), "utf8");
  return { jsonPath, csvPath };
}

export async function readJsonIfExists(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatTopics(topics) {
  if (!Array.isArray(topics) || topics.length === 0) return "";
  return topics
    .map((t) => (t && t.topic ? t.topic : ""))
    .filter(Boolean)
    .join("|");
}

function buildNewsSentimentItem(dataSource) {
  const {
    relevance_score,
    symbol,
    topics,
    title,
    source,
    url,
    time_published,
    ticker_sentiment_score,
    ticker_sentiment_label,
    summary,
  } = dataSource;
  return {
    ts_utc: toIsoUtc(),
    ticker: symbol,
    title,
    source,
    url,
    time_published,
    overall_sentiment_score: ticker_sentiment_score,
    overall_sentiment_label: ticker_sentiment_label,
    summary,
    relevance_score,
    topic: formatTopics(topics),
  };
}

/**
 * 筛选最相关的 MAXNews 个新闻
 * @param {Array} mergePool 合并池
 * @param {Object} item
 * @param {Number} maxNews 最大新闻数量
 */
export function addNextNewsSentiment(mergePool, item, maxNews = 20) {
  const {
    ticker_sentiment,
    title,
    url,
    source,
    time_published,
    topics,
    summary,
    symbol,
  } = item;
  const tickerSentiment = Array.isArray(ticker_sentiment)
    ? ticker_sentiment
    : [];
  const specific = tickerSentiment.find((t) => t?.ticker === symbol);
  if (!specific) return;
  const { relevance_score, ticker_sentiment_score, ticker_sentiment_label } =
    specific;
  if (parseFloat(relevance_score) > 0.7) {
    if (mergePool.length) {
      let inserted = false;
      for (let i = mergePool.length - 1; i >= 0; i--) {
        let currentCompare = mergePool[i];
        if (
          parseFloat(relevance_score) >
          parseFloat(currentCompare.relevance_score)
        ) {
          continue;
        } else {
          // 插入当前位置的后面
          // 如果更新后长度超过 MaxNews, 则删除队尾。
          mergePool.splice(
            i + 1,
            0,
            buildNewsSentimentItem({
              relevance_score,
              symbol,
              topics,
              title,
              source,
              url,
              summary,
              ticker_sentiment_score,
              ticker_sentiment_label,
              time_published,
            }),
          );
          if (mergePool.length > maxNews) {
            mergePool.pop();
          }
          inserted = true;
          break;
        }
      }
      // 新项比所有现有项都大，插到队首
      if (!inserted) {
        mergePool.unshift(
          buildNewsSentimentItem({
            relevance_score,
            symbol,
            topics,
            title,
            source,
            url,
            summary,
            ticker_sentiment_score,
            ticker_sentiment_label,
            time_published,
          }),
        );
        if (mergePool.length > maxNews) {
          mergePool.pop();
        }
      }
    } else {
      mergePool.push(
        buildNewsSentimentItem({
          relevance_score,
          symbol,
          topics,
          title,
          source,
          url,
          time_published,
          ticker_sentiment_score,
          ticker_sentiment_label,
          summary,
        }),
      );
    }
  }
}
