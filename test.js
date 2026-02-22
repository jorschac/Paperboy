import { feed } from './feed.js';


function formatTopics(topics) {
    if (!Array.isArray(topics) || topics.length === 0) return "";
    return topics
      .map((t) => (t && t.topic ? t.topic : ""))
      .filter(Boolean)
      .join("|");
}

function toIsoUtc(input = new Date()) {
    return new Date(input).toISOString();
}
  
function buildNewsSentimentItem(dataSource) {
    const {relevance_score, symbol, topics, 
        title, source, url, time_published, 
        ticker_sentiment_score, ticker_sentiment_label, summary} = dataSource
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
    }
}

/**
 * 筛选最相关的 MAXNews 个新闻
 * @param {Array} rows 新闻列表
 * @param {Object} item 
 * @param {Number} maxNews 最大新闻数量
 */
export function addNextNewsSentiment(rows, item, maxNews = 20) {
    const {
        ticker_sentiment,
        title,
        url,
        source,
        time_published,
        topics,
        summary,
        symbol
    } = item
    const tickerSentiment = Array.isArray(ticker_sentiment)
    ? ticker_sentiment
    : [];
    const specific = tickerSentiment.find((t) => t?.ticker === symbol);
    if(!specific) return
    const {relevance_score, ticker_sentiment_score, ticker_sentiment_label} = specific
    if(parseFloat(relevance_score) > 0.7) {
        if(rows.length) {
        let inserted = false
        for(let i = rows.length-1; i >= 0; i--) {
            let currentCompare = rows[i]
            if(parseFloat(relevance_score) > parseFloat(currentCompare.relevance_score)) {
            continue
            } else {
            // 插入当前位置的后面
            // 如果更新后长度超过 MaxNews, 则删除队尾。
            rows.splice(i+1, 0, buildNewsSentimentItem({
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
            }))
            if(rows.length > maxNews) {
                rows.pop()
            }
            inserted = true
            break
            }
        }
        // 新项比所有现有项都大，插到队首
        if (!inserted) {
            rows.unshift(buildNewsSentimentItem({
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
            }))
            if(rows.length > maxNews) {
                rows.pop()
            }
        }
        } else {
        rows.push(buildNewsSentimentItem({
            relevance_score,
            symbol,
            topics,
            title,
            source,
            url,
            time_published,
            ticker_sentiment_score,
            ticker_sentiment_label,
            summary
        }))
        }
    }
}

const symbol = 'MSFT'
const MAX_NEWS = 20
const rows = []
const dedupe = new Set()
for (const item of feed) {
   // console.log('item 是啥？？\n\n ======= \n', item, '\n\n ======= \n')
    const key = `${symbol}|${item.url ?? ""}|${item.time_published ?? ""}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    addNextNewsSentiment(rows, {symbol, ...item}, MAX_NEWS);
}
console.log(' rows 共有', rows.length, '条数据：  \n\n')
console.log(rows)