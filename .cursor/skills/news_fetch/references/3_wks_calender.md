# Overview

Scrape the ForexFactory economic calendar for the next 3 weeks using a **headed Chromium browser** (required to pass Cloudflare bot detection) and the `browser-use` CLI. The agent navigates week by week, extracts events via JavaScript `eval`, converts local timestamps to UTC, and writes `3w_calender.json` to `$OUT_PATH`.

## Pre-flight

Confirm `browser-use` is on PATH (source shell config first):

```bash
browser-use -h
```

Following instructions SHOULD take first priority, but if you are not certain about browser-use usage, invoke /browser-use skill instead and describe your needs in natural language.

**You need to complete Step 1-5 in one single `Bash` subagent.**

## Step 1: Open Headed Browser and Verify Visibility

Open a visible Chromium window pointing at the ForexFactory calendar:

```bash
source ~/.zshrc && browser-use --browser chromium --headed open https://www.forexfactory.com/calendar
```

Confirm the browser process is running and **visible to the user** (not just a background process):

```bash
# Check Chromium process is alive
pgrep -fl chromium | head -5
# Expected output: a line containing "chromium" with "--headed" or window args

# If no output, the window failed to open — re-run with explicit display
DISPLAY=:0 browser-use --browser chromium --headed open https://www.forexfactory.com/calendar
```

> **Note**: Headless mode (`browser-use open` without `--headed`) triggers Cloudflare's bot challenge and will stall. Always use `--headed`. Wait **5–8 seconds** after opening for the Cloudflare non-interactive challenge to auto-resolve.

## Step 2: Extract This Week's Events

After the page loads, extract all visible calendar rows via JS eval:

```bash
sleep 6 && browser-use --headed eval "
JSON.stringify(
  Array.from(document.querySelectorAll('table.calendar__table tr.calendar__row')).map(row => {
    const date     = row.querySelector('td.calendar__date')?.innerText?.trim() || '';
    const time     = row.querySelector('td.calendar__time')?.innerText?.trim() || '';
    const currency = row.querySelector('td.calendar__currency')?.innerText?.trim() || '';
    const impact   = row.querySelector('td.calendar__impact span')?.title || '';
    const event    = row.querySelector('td.calendar__event')?.innerText?.trim() || '';
    const actual   = row.querySelector('td.calendar__actual')?.innerText?.trim() || '';
    const forecast = row.querySelector('td.calendar__forecast')?.innerText?.trim() || '';
    const previous = row.querySelector('td.calendar__previous')?.innerText?.trim() || '';
    return {date, time, currency, impact, event, actual, forecast, previous};
  }).filter(r => r.event)
)"
```

## Step 3: Navigate to Next Weeks

Use JS eval to click the week navigation link (avoids needing to know the element index):

```bash
# Navigate to Next Week
browser-use --headed eval "
const links = Array.from(document.querySelectorAll('a'));
const next = links.find(l => l.title && l.title.match(/Next Week|Mar|Feb/));
if (next) { next.click(); 'clicked: ' + next.title; }
"
sleep 3
# Re-run the Step 2 extraction script to collect the new week's data
```

Repeat once more to collect the third week (3 total passes: This Week → Next Week → Week After).

## Step 4: Write `3w_calender.json`

Merge the three arrays, convert display times from the page's local timezone to UTC, map to the `calendar_3w` schema, and write the file:

```js
// Pseudocode — run inside Node.js or adapt to your pipeline
const TZ_OFFSET_HOURS = 8; // CST = UTC+8 (match the timezone shown on the ForexFactory page)

function toUTC(dateStr, timeStr) {
  if (!dateStr || !timeStr || ['All Day','Tentative','Nov Data'].includes(timeStr)) return null;
  const [h, m] = timeStr.replace(/[ap]m/,'').split(':').map(Number);
  const isPM = timeStr.includes('pm') && h !== 12;
  const isAM = timeStr.includes('am') && h === 12;
  const hour24 = isPM ? h + 12 : isAM ? 0 : h;
  const localMs = new Date(`${dateStr} ${hour24}:${m || 0}:00`).getTime();
  return new Date(localMs - TZ_OFFSET_HOURS * 3600 * 1000).toISOString();
}

const all = [...week1Events, ...week2Events, ...week3Events];
const out = all
  .filter(r => r.event && r.impact !== 'Non-Economic')
  .map(r => ({
    event_time_utc: toUTC(r.date, r.time),
    currency:       r.currency,
    event:          r.event,
    actual:         r.actual  || null,
    previous:       r.previous || null,
    consensus:      r.forecast || null,
    source:         'forexfactory.com'
  }));

fs.mkdirSync(OUT_PATH, { recursive: true });
fs.writeFileSync(`${OUT_PATH}/3w_calender.json`, JSON.stringify(out, null, 2));
```

## Step 5: close the session

Always run this command to stop all browser-use sessions

```bash
 browser-use close
```

## Outputs

- `$OUT_PATH/3w_calender.json` — all economic events for the next 3 weeks, schema per `references/schemas.md → calendar_3w`

## Field Mapping Reference

| ForexFactory column | Schema field      |
|---------------------|-------------------|
| Date + Time (local) | `event_time_utc`  |
| Currency            | `currency`        |
| Event name          | `event`           |
| Actual              | `actual`          |
| Previous            | `previous`        |
| Forecast            | `consensus`       |
| (hardcoded)         | `source`          |
