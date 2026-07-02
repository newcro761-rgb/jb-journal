# 07:00 미장 테마 체크 자동화 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Phase checkpoint rule (overrides default cadence):** The user explicitly asked to review after each Phase (not just after each task) before continuing. Phases map to tasks as: Phase 1 = Task 1, Phase 2 = Task 2, Phase 3 = Tasks 3-5, Phase 4 = Task 6, Phase 5 = Task 7. After the last task in a phase, stop and get explicit user confirmation before starting the next phase's first task, even under subagent-driven-development's normal per-task review flow.

**Goal:** Every KST weekday morning at ~07:00, automatically score US overnight theme moves, cross-check them against the user's buy-plan themes for that day, and send a Telegram alert before the 08:00 NXT open so gap-down orders can be pulled from 영웅문 in time.

**Architecture:** A GitHub Actions cron job runs `scripts/premarket_check.py`, which pulls proxy-ticker prices from `yfinance`, scores each theme, fetches today's buy plans from the existing Apps Script backend (`getTodayPlans`), judges each plan's theme against fixed thresholds, pushes a Telegram message, and writes the result back to a new `premarket_checks` Sheet tab (`premarket-check-save`) so the journal's `index.html` can render it as a card. No new infrastructure — reuses the existing GAS Web App / Sheets backend and static GitHub Pages frontend.

**Tech Stack:** Python 3.11 + `yfinance` + `requests` (GitHub Actions), Google Apps Script (`apps-script/Code.gs`), vanilla JS/HTML/CSS (`index.html`), GitHub Actions cron.

## Global Constraints

- Confirmed authoritative Apps Script deployment URL (verified against `index.html:487`, **not** the one in the original instruction doc, which was stale): `https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec`
- `Code.gs` routes POST by a JSON `type` field (`plan-save`, `plan-update`, `plan-delete`, ...), not by a query-string `action`. The new POST action follows this existing convention as `type: 'premarket-check-save'` rather than introducing a mismatched `action` field. GET routing has no existing convention (doGet ignores `e.parameter` entirely today), so the two new GET actions introduce query-string `action=` routing cleanly.
- Actual current POST behavior: `fetch(..., {mode:'no-cors', body: JSON.stringify(...)})` with **no explicit `Content-Type` header** — the browser defaults this to `text/plain;charset=UTF-8`, which is what avoids the CORS preflight (not because `Code.gs` reads the header — `doPost` never inspects `Content-Type` and just does `JSON.parse(e.postData.contents)`). `scripts/premarket_check.py` runs server-side (GitHub Actions), so CORS/preflight do not apply to it at all — but it will still send `Content-Type: text/plain` for consistency with the existing pattern per the original instructions.
- `Code.gs` success responses are JSON `{"result":"OK"}`, not the plain string `"ok"`. `scripts/premarket_check.py` must check the JSON `result` field, not `resp.text.includes('ok')`.
- All theme keys used across `index.html`, `Code.gs`, and `premarket_check.py` must match this exact 20-item Korean list (source: original instructions §2): `반도체장비, 메모리반도체, AI반도체, 반도체소재부품, 2차전지, 바이오, 방산, 조선, 원전, 로봇, 소프트웨어/AI서비스, 사이버보안, 금융, 에너지/정유, 우주항공, 엔터, 화장품, 게임, 정치테마, 기타(미장무관)`.
- All 27 proxy tickers + 3 index tickers were verified live against `yfinance` on 2026-07-02 (5-day download, all returned valid closes) — no substitutions needed from the original instruction doc's list.
- Backtest sanity-check already run against real 2026-06-30→07-01 US session data (see Task 5): 반도체장비 theme scored **-10.48%** and SOX scored **-6.27%**, both past the `cancel` threshold — confirms the rule design actually catches the 유진테크 incident from the problem statement.
- "반도체 계열 테마" (subject to the SOX-override rule) = `{반도체장비, 메모리반도체, AI반도체, 반도체소재부품}` — i.e. every theme whose proxy basket is semiconductor-related. This is an inference from the spec (not stated as a literal set anywhere in the original instructions) — flag it for explicit confirmation at the Phase 3 checkpoint.
- Never commit `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, or the Apps Script URL as literals in `.github/workflows/premarket.yml` — only as `${{ secrets.* }}`.
- Commit per phase, matching this repo's existing convention (see `git log` in `jb-journal`).

---

### Task 1: `index.html` — add theme multi-select to the plan-add form (Phase 1)

**Files:**
- Modify: `C:\Users\June\jb-journal\index.html`

**Interfaces:**
- Produces: `THEME_OPTIONS` (array of 20 Korean strings, exact list in Global Constraints) — consumed by Task 7's card renderer for badge coloring/labels is not needed, but Task 2's `Code.gs` must store/return whatever array shape this task sends (JSON array of 0-2 strings) under a `themes` key on the plan object.
- Produces: plan objects now carry `themes: string[]` (0-2 items) in addition to existing `id, date, name, code, b1, q1, b2, q2, custSL, sells, use2, regime`.

- [ ] **Step 1: Add `THEME_OPTIONS` constant and `.pc-theme` CSS**

  In the `<style>` block, right after the existing `.pc-regime.r-down` rule (around line 203), add:

  ```css
    .pc-theme {
      display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 10px;
      background: rgba(30,144,255,0.15); color: var(--blue); margin: 2px 4px 2px 0;
    }
  ```

- [ ] **Step 2: Add the theme-pills block to the add-plan form**

  In `index.html`, find the add-plan form's 2차 매수가/수량 `row2` block (around line 261-270) and add the theme pills right after it, before the `+ 목록에 추가` save button (currently at line 271):

  ```html
        <div style="margin-top:8px;">
          <label>테마 <span style="color:var(--muted);font-weight:400;">(최대 2개, 미장 프리마켓 체크용)</span></label>
          <div class="pills" id="p-theme-pills"></div>
        </div>
        <button class="save-btn" style="margin-top:12px;" onclick="addPlanAndSwitch()">+ 목록에 추가</button>
  ```

  (This replaces just the `<button class="save-btn" ...>` line — insert the new `<div>` block immediately before it, keep the existing button line as-is.)

- [ ] **Step 3: Add `THEME_OPTIONS`, `planThemes` state, and pill rendering/toggle functions**

  In the `<script>` block, right after the existing state declarations (after `let resultVerdict = null;` around line 500), add:

  ```js
    const THEME_OPTIONS = ['반도체장비','메모리반도체','AI반도체','반도체소재부품','2차전지','바이오','방산','조선','원전','로봇','소프트웨어/AI서비스','사이버보안','금융','에너지/정유','우주항공','엔터','화장품','게임','정치테마','기타(미장무관)'];
    let planThemes = []; // 계획 추가 폼에서 선택한 테마 (최대 2개)

    function renderThemePills() {
      document.getElementById('p-theme-pills').innerHTML = THEME_OPTIONS.map(t =>
        `<span class="pill" data-theme="${t}" onclick="togglePlanTheme('${t}', this)">${t}</span>`
      ).join('');
    }

    function togglePlanTheme(theme, el) {
      const i = planThemes.indexOf(theme);
      if (i >= 0) {
        planThemes.splice(i, 1);
        el.classList.remove('active');
      } else {
        if (planThemes.length >= 2) { showToast('테마는 최대 2개까지 선택 가능'); return; }
        planThemes.push(theme);
        el.classList.add('active');
      }
    }
  ```

- [ ] **Step 4: Include `themes` when building and resetting the plan object**

  In `addPlan()` (around line 588), change:

  ```js
    const plan = { id: Date.now(), date, name, code, b1, q1, b2: b2||null, q2: q2||null, custSL: custSL||null, sells: [], regime: planRegime };
  ```

  to:

  ```js
    const plan = { id: Date.now(), date, name, code, b1, q1, b2: b2||null, q2: q2||null, custSL: custSL||null, sells: [], regime: planRegime, themes: planThemes.slice() };
  ```

  And in the reset block right after (around line 593-594, next to the `planRegime = null;` reset), add:

  ```js
    planThemes = [];
    document.querySelectorAll('#p-theme-pills .pill').forEach(el => el.classList.remove('active'));
  ```

- [ ] **Step 5: Load `themes` from the sheet and render badges on plan cards**

  In `initPlans()`'s row-mapping (around line 557-565), add a `themes` field after `regime`:

  ```js
        plans = rows.filter(r => r[0]).map(r => ({
          id: Number(r[0]), date: r[1], name: r[2], code: r[3],
          b1: Number(r[4]), q1: Number(r[5]),
          b2: r[6] ? Number(r[6]) : null, q2: r[7] ? Number(r[7]) : null,
          custSL: r[8] ? Number(r[8]) : null,
          sells: r[9] ? JSON.parse(r[9]) : [],
          use2: r[10] === true || r[10] === 'true' ? true : (r[10] === false || r[10] === 'false' ? false : undefined),
          regime: r[11] || null,
          themes: r[12] ? JSON.parse(r[12]) : []
        }));
  ```

  In `renderPlans()` (around line 699), add a badge line right after `regimeBadge`:

  ```js
      const regimeBadge = p.regime ? `<span class="pc-regime r-${p.regime}">${REGIME_LABEL[p.regime]}</span>` : '';
      const themeBadges = (p.themes || []).map(t => `<span class="pc-theme">${t}</span>`).join('');
  ```

  and in the template literal right below (around line 706), add `${themeBadges}` right after `${regimeBadge}`:

  ```js
          ${regimeBadge}
          ${themeBadges}
          ${orderLine}
  ```

- [ ] **Step 6: Call `renderThemePills()` on load**

  In the `DOMContentLoaded` handler (around line 1225-1230), add the call next to `initPlans()`:

  ```js
  window.addEventListener('DOMContentLoaded', ()=>{
    const urlEl = document.getElementById('sheets-url-display');
    if (urlEl) urlEl.textContent = SHEETS_URL;
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
    renderThemePills();
    initPlans();
  });
  ```

- [ ] **Step 7: Manual verification in a browser**

  Open `index.html` directly in a browser (`start index.html` or drag into a browser tab — no server needed, it's a static file). Confirm:
  - The "+ 추가" subtab shows a "테마" pill row with 20 options.
  - Clicking 3 pills only activates 2 (toast warns "최대 2개까지 선택 가능" on the 3rd).
  - Filling in a full plan (종목명/1차 매수가/수량/장세) with 1-2 themes selected and clicking "+ 목록에 추가" adds a card to "대기 목록" showing the theme badge(s).
  - Reloading the page (which re-fetches from the live Sheet) still shows the theme badges on that card — confirms the round-trip through `Code.gs` works even before Task 2's dedicated read/write changes, since `Code.gs`'s existing `plan-save`/doGet fallback already appends/returns whatever columns exist positionally. If this step fails because Task 2 hasn't been done yet, that's expected — re-run this same manual check after Task 2 is deployed instead of blocking on it now.

- [ ] **Step 8: Commit**

  ```bash
  cd /c/Users/June/jb-journal
  git add index.html
  git commit -m "feat: add theme multi-select to plan-add form for premarket check"
  ```

- [ ] **STOP — Phase 1 checkpoint.** Report the browser verification results and wait for user confirmation before starting Task 2.

---

### Task 2: `apps-script/Code.gs` — add `getTodayPlans`, `getPremarketCheck`, `premarket-check-save` (Phase 2)

**Files:**
- Modify: `C:\Users\June\jb-journal\apps-script\Code.gs`

**Interfaces:**
- Consumes: `themes` field from Task 1's plan objects (JSON array).
- Produces: `GET ?action=getTodayPlans&date=YYYY-MM-DD` → `[{id, date, name, ticker, entry1, qty1, entry2, qty2, stop, themes}]`. Consumed by Task 3's `fetch_today_plans()`.
- Produces: `GET ?action=getPremarketCheck&date=YYYY-MM-DD` → the exact JSON object last saved via `premarket-check-save` for that date, or `null`. Consumed by Task 7's `loadPremarketCheck()`.
- Consumes: `POST {type:'premarket-check-save', date, checkedAt, marketOpen, indices, themesUp, themesDown, verdicts}` from Task 4's `post_check_result()`.

- [ ] **Step 1: Replace the full contents of `Code.gs`**

  ```javascript
  function doGet(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = e.parameter && e.parameter.action;

    if (action === 'getTodayPlans') {
      return getTodayPlans_(ss, e.parameter.date);
    }
    if (action === 'getPremarketCheck') {
      return getPremarketCheck_(ss, e.parameter.date);
    }

    const sheet = ss.getSheetByName('Plans');
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    const values = sheet.getDataRange().getValues();
    return ContentService.createTextOutput(JSON.stringify(values)).setMimeType(ContentService.MimeType.JSON);
  }

  function getTodayPlans_(ss, dateStr) {
    const sheet = ss.getSheetByName('Plans');
    if (!sheet || !dateStr) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
    const values = sheet.getDataRange().getValues();
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      if (!r[0]) continue;
      if (String(r[1]) !== dateStr) continue;
      out.push({
        id: r[0], date: r[1], name: r[2], ticker: r[3],
        entry1: r[4], qty1: r[5], entry2: r[6] || null, qty2: r[7] || null,
        stop: r[8] || null,
        themes: r[12] ? JSON.parse(r[12]) : []
      });
    }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }

  function getPremarketCheck_(ss, dateStr) {
    const sheet = ss.getSheetByName('premarket_checks');
    if (!sheet || !dateStr) return ContentService.createTextOutput('null').setMimeType(ContentService.MimeType.JSON);
    const values = sheet.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
      if (String(values[i][0]) === dateStr) {
        return ContentService.createTextOutput(values[i][2]).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput('null').setMimeType(ContentService.MimeType.JSON);
  }

  function doPost(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);

    if (data.type === 'plan-save') {
      let sheet = ss.getSheetByName('Plans');
      if (!sheet) sheet = ss.insertSheet('Plans');
      const p = data.plan;
      sheet.appendRow([
        p.id, p.date, p.name, p.code,
        p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
        JSON.stringify(p.sells || []),
        p.use2 === undefined ? '' : p.use2,
        p.regime || '',
        JSON.stringify(p.themes || [])
      ]);
      return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'plan-update') {
      let sheet = ss.getSheetByName('Plans');
      if (!sheet) return ContentService.createTextOutput('OK');
      const p = data.plan;
      const values = sheet.getDataRange().getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]) === String(p.id)) {
          sheet.getRange(i + 1, 1, 1, 13).setValues([[
            p.id, p.date, p.name, p.code,
            p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
            JSON.stringify(p.sells || []),
            p.use2 === undefined ? '' : p.use2,
            p.regime || '',
            JSON.stringify(p.themes || [])
          ]]);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'plan-delete') {
      let sheet = ss.getSheetByName('Plans');
      if (!sheet) return ContentService.createTextOutput('OK');
      const values = sheet.getDataRange().getValues();
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0]) === String(data.id)) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.type === 'premarket-check-save') {
      let sheet = ss.getSheetByName('premarket_checks');
      if (!sheet) {
        sheet = ss.insertSheet('premarket_checks');
        sheet.appendRow(['date', 'checkedAt', 'raw_json']);
      }
      sheet.appendRow([data.date, data.checkedAt || '', JSON.stringify(data)]);
      return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 거래 저장 (기존 — 30열 row, 변경 없음)
    const sheet = ss.getActiveSheet();
    sheet.appendRow(data.row);
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  ```

- [ ] **Step 2: Deploy — update the existing deployment, do NOT create a new one**

  In the Apps Script editor (script.google.com, bound to Sheet ID referenced in the project): paste the new `Code.gs` contents, then use **Deploy → Manage deployments → (pencil/edit icon on the existing Web App deployment) → Version: New version → Deploy**. This keeps the same `/exec` URL (`...AKfycbyPh528.../exec`) that `index.html` already points to. Do **not** use "New deployment", which would mint a different URL and break `index.html`.

- [ ] **Step 3: Verify via curl**

  ```bash
  curl -s "https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec?action=getTodayPlans&date=2099-01-01"
  ```
  Expected: `[]` (no plans on that made-up date — confirms the new route works without touching real data).

  ```bash
  curl -s "https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec?action=getPremarketCheck&date=2099-01-01"
  ```
  Expected: `null`.

  ```bash
  curl -s "https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec"
  ```
  Expected: unchanged — the full raw `Plans` rows array, same shape as before this change (confirms backward compatibility with `index.html`'s `initPlans()`).

- [ ] **Step 4: Commit**

  ```bash
  cd /c/Users/June/jb-journal
  git add apps-script/Code.gs
  git commit -m "feat: add getTodayPlans/getPremarketCheck GET routes and premarket-check-save POST type"
  ```

- [ ] **STOP — Phase 2 checkpoint.** Report the three curl outputs and wait for user confirmation before starting Task 3.

---

### Task 3: `scripts/premarket_check.py` — data collection, theme scoring, judgment (Phase 3, part 1)

**Files:**
- Create: `C:\Users\June\jb-journal\scripts\premarket_check.py`

**Interfaces:**
- Produces: `THEME_PROXY`, `SEMI_THEMES`, `INDEX_TICKERS`, `KR_MARKET_HOLIDAYS_2026`, `fetch_prices(tickers, end_date=None, retries=3, delay=5) -> (pct: dict[str,float], last_dates: dict[str,date])`, `compute_theme_scores(pct) -> dict[str,float]`, `judge_stock(themes, theme_scores, pct, sox_pct) -> (verdict: str, reason: str)`, `is_kr_market_holiday(dt) -> bool`, `expected_last_us_trading_date(run_dt_kst) -> date`. All consumed by Task 4's `main()`.

- [ ] **Step 1: Write the constants and holiday/date helpers**

  ```python
  """07:00 KST premarket theme-overlap check.

  Fetches the prior US session's theme-proxy price moves, cross-checks them
  against today's KR buy-plan themes, and alerts via Telegram before the
  08:00 KST NXT open.
  """
  import argparse
  import json
  import os
  import sys
  import time
  from datetime import datetime, timedelta
  from zoneinfo import ZoneInfo

  import requests
  import yfinance as yf

  KST = ZoneInfo("Asia/Seoul")

  THEME_PROXY = {
      "반도체장비": ["AMAT", "LRCX", "KLAC"],
      "메모리반도체": ["MU", "SNDK", "WDC"],
      "AI반도체": ["NVDA", "AVGO", "AMD"],
      "반도체소재부품": ["SOXX"],
      "2차전지": ["LIT", "ALB", "TSLA"],
      "바이오": ["XBI"],
      "소프트웨어/AI서비스": ["IGV", "MSFT", "META"],
      "사이버보안": ["HACK"],
      "금융": ["XLF"],
      "에너지/정유": ["XLE", "USO"],
      "원전": ["URA", "NLR"],
      "로봇": ["BOTZ"],
      "우주항공": ["ITA", "ARKX"],
      "게임": ["ESPO"],
      "방산": None,
      "조선": None,
      "엔터": None,
      "화장품": None,
      "정치테마": None,
      "기타(미장무관)": None,
  }

  # SOX가 급락하면 이 테마들은 자체 점수와 무관하게 SOX 점수까지 함께 반영한다.
  SEMI_THEMES = {"반도체장비", "메모리반도체", "AI반도체", "반도체소재부품"}

  INDEX_TICKERS = {"나스닥": "^IXIC", "S&P500": "^GSPC", "필라델피아반도체": "^SOX"}

  THEME_DOWN_MODERATE = -3.0
  THEME_DOWN_SEVERE = -5.0

  # 매년 초 KRX 휴장일 공지로 갱신할 것 (best-effort 수동 리스트, 2026-07-02 기준 작성).
  # 주말은 요일 체크로 걸러지므로 평일 휴장일만 넣는다.
  KR_MARKET_HOLIDAYS_2026 = {
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-02",
      "2026-05-01", "2026-05-05", "2026-05-25", "2026-08-17",
      "2026-09-24", "2026-09-25", "2026-10-05", "2026-10-09",
      "2026-12-25", "2026-12-31",
  }


  def kst_now():
      return datetime.now(KST)


  def is_kr_market_holiday(dt):
      if dt.weekday() >= 5:
          return True
      return dt.strftime("%Y-%m-%d") in KR_MARKET_HOLIDAYS_2026


  def expected_last_us_trading_date(run_dt_kst):
      """전날(KST) 기준 가장 최근 평일 — 정상장이면 US 데이터의 최신 종가일과 같아야 한다."""
      d = (run_dt_kst - timedelta(days=1)).date()
      while d.weekday() >= 5:
          d -= timedelta(days=1)
      return d
  ```

- [ ] **Step 2: Verify the date helpers with a quick manual check**

  ```bash
  cd /c/Users/June/jb-journal
  py -3.11 -c "
  from datetime import datetime
  from zoneinfo import ZoneInfo
  import sys; sys.path.insert(0, 'scripts')
  from premarket_check import expected_last_us_trading_date, is_kr_market_holiday
  KST = ZoneInfo('Asia/Seoul')
  # 2026-07-02(목) 07:00 실행 -> 기대 미장 마지막 거래일 = 2026-07-01(수)
  print(expected_last_us_trading_date(datetime(2026,7,2,7,0,tzinfo=KST)))
  # 2026-07-06(월) 07:00 실행 -> 기대 미장 마지막 거래일 = 2026-07-04(토 아님, 금요일로 롤백) = 07-03 금요일이 아니라 07-04는 토요일이므로 07-03(금)으로 롤백
  print(expected_last_us_trading_date(datetime(2026,7,6,7,0,tzinfo=KST)))
  print(is_kr_market_holiday(datetime(2026,7,2,7,0,tzinfo=KST)))   # False (평일, 휴장일 아님)
  print(is_kr_market_holiday(datetime(2026,2,17,7,0,tzinfo=KST)))  # True (설날)
  print(is_kr_market_holiday(datetime(2026,7,4,7,0,tzinfo=KST)))   # True (토요일)
  "
  ```
  Expected output (5 lines): `2026-07-01`, `2026-07-03`, `False`, `True`, `True`.

- [ ] **Step 3: Write `fetch_prices` and `compute_theme_scores`**

  Append to `scripts/premarket_check.py`:

  ```python
  def fetch_prices(tickers, end_date=None, retries=3, delay=5):
      """전 종목의 최근 거래일 등락률(%)과 최신 종가일을 반환. 3회 재시도 후 실패 시 raise."""
      kwargs = dict(period="15d") if end_date is None else dict(
          start=(end_date - timedelta(days=20)).isoformat(),
          end=(end_date + timedelta(days=1)).isoformat(),
      )
      last_err = None
      for attempt in range(retries):
          try:
              data = yf.download(tickers, interval="1d", group_by="ticker",
                                  threads=True, progress=False, **kwargs)
              pct = {}
              last_dates = {}
              for t in tickers:
                  close = data[t]["Close"].dropna()
                  if len(close) < 2:
                      raise ValueError(f"{t}: insufficient data ({len(close)} rows)")
                  pct[t] = float((close.iloc[-1] / close.iloc[-2] - 1) * 100)
                  last_dates[t] = close.index[-1].date()
              return pct, last_dates
          except Exception as e:
              last_err = e
              if attempt < retries - 1:
                  time.sleep(delay)
      raise RuntimeError(f"yfinance fetch failed after {retries} attempts: {last_err}")


  def compute_theme_scores(pct):
      scores = {}
      for theme, proxies in THEME_PROXY.items():
          if not proxies:
              continue
          scores[theme] = sum(pct[t] for t in proxies) / len(proxies)
      return scores
  ```

- [ ] **Step 4: Write `judge_stock`**

  Append:

  ```python
  _VERDICT_RANK = {"ok": 0, "reduce": 1, "cancel": 2}


  def judge_stock(themes, theme_scores, pct, sox_pct):
      """종목의 테마 목록 중 가장 나쁜 판정을 반환. themes가 비었거나 모두 미장무관이면 ok."""
      if not themes:
          return "ok", "테마 미지정"

      best_verdict = "ok"
      reasons = []
      any_mapped = False
      for theme in themes:
          proxies = THEME_PROXY.get(theme)
          if not proxies:
              continue
          any_mapped = True
          score = theme_scores[theme]
          is_semi = theme in SEMI_THEMES
          effective = min(score, sox_pct) if is_semi else score

          if effective <= THEME_DOWN_SEVERE:
              v = "cancel"
          elif effective <= THEME_DOWN_MODERATE:
              v = "reduce"
          else:
              v = "ok"

          if _VERDICT_RANK[v] > _VERDICT_RANK[best_verdict]:
              best_verdict = v

          if v != "ok":
              detail = ", ".join(f"{t} {pct[t]:+.1f}%" for t in proxies)
              note = f"{theme}({detail})"
              if is_semi and sox_pct <= THEME_DOWN_MODERATE:
                  note += f", SOX {sox_pct:+.1f}%"
              reasons.append(note)

      if best_verdict == "ok":
          return "ok", ("미장 무관" if not any_mapped else "정상 범위")
      return best_verdict, " / ".join(reasons)
  ```

- [ ] **Step 5: Verify `judge_stock` against the real 2026-06-30→07-01 backtest data**

  ```bash
  cd /c/Users/June/jb-journal
  py -3.11 -c "
  import sys; sys.path.insert(0, 'scripts')
  from premarket_check import fetch_prices, compute_theme_scores, judge_stock, THEME_PROXY
  from datetime import date
  tickers = sorted({t for ps in THEME_PROXY.values() if ps for t in ps} | {'^IXIC','^GSPC','^SOX'})
  pct, last_dates = fetch_prices(tickers, end_date=date(2026,7,1))
  scores = compute_theme_scores(pct)
  print('반도체장비 score:', round(scores['반도체장비'], 2))
  print('SOX pct:', round(pct['^SOX'], 2))
  print(judge_stock(['반도체장비'], scores, pct, pct['^SOX']))
  "
  ```
  Expected: 반도체장비 score around `-10.48`, SOX pct around `-6.27`, and `judge_stock` returns `('cancel', '반도체장비(AMAT ...%, LRCX ...%, KLAC ...%), SOX -6.3%')` (exact decimals may vary slightly by the instant the check is run, but the verdict must be `'cancel'`).

- [ ] **Step 6: Commit**

  ```bash
  cd /c/Users/June/jb-journal
  git add scripts/premarket_check.py
  git commit -m "feat: add theme scoring and verdict logic for premarket check"
  ```

---

### Task 4: `scripts/premarket_check.py` — Telegram/Apps Script I/O and `main()` (Phase 3, part 2)

**Files:**
- Modify: `C:\Users\June\jb-journal\scripts\premarket_check.py`

**Interfaces:**
- Consumes: everything from Task 3.
- Consumes: `GET {APPS_SCRIPT_URL}?action=getTodayPlans&date=...` (Task 2).
- Produces: `POST {APPS_SCRIPT_URL}` with `type: 'premarket-check-save'` (consumed by Task 2's `Code.gs` and, downstream, Task 7's card).
- Produces: Telegram message via Bot API `sendMessage`.

- [ ] **Step 1: Write env/config loading and Telegram/Sheets I/O helpers**

  Append to `scripts/premarket_check.py`:

  ```python
  VERDICT_EMOJI = {"cancel": "🚫", "reduce": "⚠️", "ok": "✅"}
  VERDICT_TEXT = {"cancel": "매수 취소 권고", "reduce": "비중 50% 축소", "ok": "정상"}

  DRY_RUN = False


  def _env(name):
      val = os.environ.get(name)
      if not val:
          raise RuntimeError(f"missing required env var: {name}")
      return val


  def send_telegram(text):
      if DRY_RUN:
          print("=== TELEGRAM (dry-run) ===")
          print(text)
          return
      token = _env("TELEGRAM_BOT_TOKEN")
      chat_id = _env("TELEGRAM_CHAT_ID")
      url = f"https://api.telegram.org/bot{token}/sendMessage"
      for i in range(0, len(text), 4000):
          chunk = text[i:i + 4000]
          r = requests.post(url, data={"chat_id": chat_id, "text": chunk}, timeout=15)
          r.raise_for_status()


  def fetch_today_plans(date_str):
      url = _env("APPS_SCRIPT_URL")
      r = requests.get(url, params={"action": "getTodayPlans", "date": date_str}, timeout=15)
      r.raise_for_status()
      return r.json()


  def post_check_result(result):
      if DRY_RUN:
          print("=== APPS SCRIPT POST (dry-run) ===")
          print(json.dumps(result, ensure_ascii=False, indent=2))
          return
      url = _env("APPS_SCRIPT_URL")
      body = {"type": "premarket-check-save", **result}
      r = requests.post(
          url,
          data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
          headers={"Content-Type": "text/plain;charset=UTF-8"},
          timeout=15,
      )
      r.raise_for_status()
      if r.json().get("result") != "OK":
          raise RuntimeError(f"premarket-check-save did not return OK: {r.text}")
  ```

- [ ] **Step 2: Write `build_message`**

  Append:

  ```python
  def build_message(run_dt, idx_pct, up3, down3, verdicts, market_note=None):
      lines = [f"📊 미장 체크 {run_dt.strftime('%m/%d')} ({run_dt.strftime('%H:%M')})"]
      if market_note:
          lines.append(market_note)
          return "\n".join(lines)

      lines.append(" | ".join(f"{name} {v:+.2f}%" for name, v in idx_pct.items()))
      lines.append("")
      if up3:
          lines.append("📈 상승: " + " / ".join(f"{t} {s:+.1f}%" for t, s in up3))
      if down3:
          lines.append("📉 하락: " + " / ".join(f"{t} {s:+.1f}%" for t, s in down3))
      lines.append("")
      if verdicts:
          lines.append("[오늘 매수 계획 판정]")
          for v in verdicts:
              emoji = VERDICT_EMOJI[v["verdict"]]
              theme_str = "/".join(v["themes"]) if v["themes"] else "테마없음"
              lines.append(f"{emoji} {v['name']} ({theme_str}) — {v['reason']} → {VERDICT_TEXT[v['verdict']]}")
      else:
          lines.append("오늘 등록된 매수 계획이 없습니다.")
      return "\n".join(lines)
  ```

- [ ] **Step 3: Write `main()` and CLI entry point**

  Append:

  ```python
  def parse_args():
      p = argparse.ArgumentParser(description=__doc__)
      p.add_argument("--asof", help="YYYY-MM-DD — backtest override for 'today' (KST)")
      p.add_argument("--dry-run", action="store_true", help="print instead of sending Telegram/Sheets")
      return p.parse_args()


  def main():
      global DRY_RUN
      args = parse_args()
      DRY_RUN = args.dry_run
      run_dt = datetime.strptime(args.asof, "%Y-%m-%d").replace(tzinfo=KST) if args.asof else kst_now()
      asof_date = run_dt.date() if args.asof else None

      if is_kr_market_holiday(run_dt):
          print(f"{run_dt.date()} — KR market holiday/weekend, skipping.")
          return

      all_tickers = sorted(
          {t for proxies in THEME_PROXY.values() if proxies for t in proxies}
          | set(INDEX_TICKERS.values())
      )

      try:
          pct, last_dates = fetch_prices(all_tickers, end_date=asof_date)
      except Exception as e:
          send_telegram(f"❌ 미장 체크 실패, 수동 확인 요망\n{run_dt.strftime('%m/%d %H:%M')} KST\n원인: {e}")
          sys.exit(1)

      expected_date = expected_last_us_trading_date(run_dt)
      sox_date = last_dates["^SOX"]
      if sox_date < expected_date - timedelta(days=3):
          send_telegram(
              f"❌ 미장 체크 실패, 수동 확인 요망\n{run_dt.strftime('%m/%d %H:%M')} KST\n"
              f"원인: 가격 데이터가 {sox_date} 이후 갱신되지 않음"
          )
          sys.exit(1)
      if sox_date < expected_date:
          send_telegram(build_message(run_dt, {}, [], [], [], market_note="🔔 미장 휴장 — 필터 미적용"))
          post_check_result({
              "date": run_dt.strftime("%Y-%m-%d"), "checkedAt": run_dt.isoformat(),
              "marketOpen": False, "indices": {}, "themesUp": [], "themesDown": [], "verdicts": [],
          })
          return

      idx_pct = {name: pct[tk] for name, tk in INDEX_TICKERS.items()}
      theme_scores = compute_theme_scores(pct)
      ranked = sorted(theme_scores.items(), key=lambda x: x[1], reverse=True)
      up3, down3 = ranked[:3], ranked[-3:][::-1]

      plans = fetch_today_plans(run_dt.strftime("%Y-%m-%d"))
      verdicts = []
      for p in plans:
          themes = p.get("themes") or []
          verdict, reason = judge_stock(themes, theme_scores, pct, idx_pct["필라델피아반도체"])
          verdicts.append({
              "ticker": p.get("ticker"), "name": p.get("name"),
              "themes": themes, "verdict": verdict, "reason": reason,
          })

      send_telegram(build_message(run_dt, idx_pct, up3, down3, verdicts))
      post_check_result({
          "date": run_dt.strftime("%Y-%m-%d"), "checkedAt": run_dt.isoformat(),
          "marketOpen": True,
          "indices": {k: round(v, 2) for k, v in idx_pct.items()},
          "themesUp": [{"theme": t, "pct": round(s, 2)} for t, s in up3],
          "themesDown": [{"theme": t, "pct": round(s, 2)} for t, s in down3],
          "verdicts": verdicts,
      })


  if __name__ == "__main__":
      main()
  ```

- [ ] **Step 4: Dry-run smoke test (no Telegram/Sheets calls)**

  `--dry-run` only skips the Telegram send and the `premarket-check-save` write — `fetch_today_plans()` is a read-only GET and still needs `APPS_SCRIPT_URL` set for real, even in dry-run:

  ```bash
  cd /c/Users/June/jb-journal
  py -3.11 -m pip install --user yfinance requests
  APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec" py -3.11 scripts/premarket_check.py --dry-run
  ```
  Expected: prints a `=== TELEGRAM (dry-run) ===` block with today's index/theme summary, then an `=== APPS SCRIPT POST (dry-run) ===` block with the full result JSON. No network errors — `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are not required in dry-run (those calls are skipped before `_env` is reached), but `APPS_SCRIPT_URL` is.

- [ ] **Step 5: Commit**

  ```bash
  cd /c/Users/June/jb-journal
  git add scripts/premarket_check.py
  git commit -m "feat: add Telegram/Apps Script I/O and main() to premarket check script"
  ```

---

### Task 5: Backtest verification against the 2026-07-02 유진테크/피에스케이 incident (Phase 3, part 3 — acceptance criterion #4)

**Files:** none (verification only, produces a report back to the user).

- [ ] **Step 1: Run the script in backtest mode for the incident date**

  ```bash
  cd /c/Users/June/jb-journal
  APPS_SCRIPT_URL="https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec" py -3.11 scripts/premarket_check.py --asof 2026-07-02 --dry-run
  ```

  `--asof 2026-07-02` sets `run_dt` to 2026-07-02 07:00 KST, so `expected_last_us_trading_date` resolves to 2026-07-01 (Wed) and `fetch_prices(..., end_date=date(2026,7,2))` pulls the real 2026-06-30→07-01 US session that preceded the actual incident.

- [ ] **Step 2: Confirm 반도체장비 gets flagged**

  In the dry-run Telegram output, confirm:
  - 필라델피아반도체(SOX) shows roughly `-6.27%`.
  - The 📉 하락 top-3 includes 반도체장비 and 메모리반도체 near the bottom.
  - If a plan with `themes: ["반도체장비"]` exists for that date in the live Sheet (or is added temporarily for the test), its verdict line shows 🚫 (매수 취소 권고) — since 반도체장비's score (~-10.5%) is already past `THEME_DOWN_SEVERE` on its own, independent of the SOX-override rule.
  - If no such plan exists in the Sheet for that date, this is still a valid confirmation as long as Task 3 Step 5's direct `judge_stock(['반도체장비'], ...)` call returned `cancel` — that already proves the theme-to-verdict path works; a live Sheet row is a nice-to-have, not required to satisfy this criterion.

- [ ] **Step 3: Report results to the user**

  Summarize: theme scores for 반도체장비/메모리반도체/AI반도체, the SOX pct, and the resulting verdict(s), confirming the rule set (as currently designed) would have flagged the 유진테크 position before the 07-02 gap-down.

- [ ] **STOP — Phase 3 checkpoint.** Report the backtest output and the SEMI_THEMES inference (Global Constraints) for explicit confirmation before starting Task 6.

---

### Task 6: GitHub Actions workflow (Phase 4)

**Files:**
- Create: `C:\Users\June\jb-journal\.github\workflows\premarket.yml`

**Interfaces:**
- Consumes: `scripts/premarket_check.py` (Task 4) and repo secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APPS_SCRIPT_URL`.

- [ ] **Step 1: Write the workflow file**

  ```yaml
  name: Premarket Theme Check

  on:
    schedule:
      # UTC 21:45 = KST 06:45 (다음날). GitHub Actions의 스케줄 cron은 부하 시
      # 5~15분 지연되는 일이 흔해서, 실제 알림이 07:00 KST까지 도착하게 하려면
      # 목표 시각보다 15분 앞선 06:45 KST(=21:45 UTC)에 걸어야 한다.
      # 대체거래소 NXT가 08:00 KST에 열리므로 그 전에 반드시 끝나야 한다.
      - cron: '45 21 * * 0-4'
    workflow_dispatch: {}

  jobs:
    check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with:
            python-version: '3.11'
        - run: pip install yfinance requests
        - run: python scripts/premarket_check.py
          env:
            TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
            TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
            APPS_SCRIPT_URL: ${{ secrets.APPS_SCRIPT_URL }}
  ```

- [ ] **Step 2: Set repo secrets (manual, user must do this — cannot be scripted)**

  In GitHub: repo → Settings → Secrets and variables → Actions → New repository secret, add:
  - `TELEGRAM_BOT_TOKEN` — from @BotFather.
  - `TELEGRAM_CHAT_ID` — the numeric chat id the bot should message.
  - `APPS_SCRIPT_URL` — `https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec` (confirmed authoritative URL from Global Constraints).

- [ ] **Step 3: Commit and push, then trigger manually**

  ```bash
  cd /c/Users/June/jb-journal
  git add .github/workflows/premarket.yml
  git commit -m "feat: add GitHub Actions cron for 07:00 KST premarket theme check"
  git push origin main
  ```

  Then in GitHub: Actions tab → "Premarket Theme Check" → "Run workflow" (uses `workflow_dispatch`). Confirm the run succeeds and a Telegram message actually arrives — this is acceptance criterion #1.

- [ ] **STOP — Phase 4 checkpoint.** Report the Actions run result and confirm the Telegram message arrived before starting Task 7.

---

### Task 7: `index.html` — "오늘의 미장 체크" card (Phase 5)

**Files:**
- Modify: `C:\Users\June\jb-journal\index.html`

**Interfaces:**
- Consumes: `GET {APPS_SCRIPT_URL}?action=getPremarketCheck&date=YYYY-MM-DD` (Task 2), returning the same shape `post_check_result()` (Task 4) sends.

- [ ] **Step 1: Add card markup**

  In `index.html`, right after `<div class="page-title">매매 계획</div>` (line 213) and before the `<!-- 서브탭 -->` comment (line 215), add:

  ```html
    <div id="premarket-card" class="section hidden" style="margin-top:8px;">
      <div class="section-title">오늘의 미장 체크</div>
      <div id="pmc-indices" style="font-size:13px;color:var(--muted);margin-bottom:8px;"></div>
      <div id="pmc-themes" style="font-size:12px;margin-bottom:10px;"></div>
      <div id="pmc-verdicts"></div>
    </div>
  ```

- [ ] **Step 2: Add card CSS**

  In the `<style>` block, right after the `.pc-theme` rule added in Task 1, add:

  ```css
    .pmc-verdict-row { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:13px; }
    .pmc-verdict-row:last-child { border-bottom:none; }
    .pmc-badge { font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; }
    .pmc-badge.ok     { color: var(--green);  background: rgba(46,213,115,0.15); }
    .pmc-badge.reduce { color: var(--orange); background: rgba(255,165,2,0.15); }
    .pmc-badge.cancel { color: var(--red);    background: rgba(255,71,87,0.15); }
  ```

- [ ] **Step 3: Add `loadPremarketCheck()`**

  In the `<script>` block, right after `renderThemePills()` (added in Task 1), add:

  ```js
    const PMC_LABEL = { ok: '정상', reduce: '비중축소', cancel: '매수취소' };

    function loadPremarketCheck() {
      const today = new Date().toISOString().split('T')[0];
      fetch(`${APPS_SCRIPT_URL}?action=getPremarketCheck&date=${today}`)
        .then(r => r.json())
        .then(check => {
          const card = document.getElementById('premarket-card');
          if (!check) { card.classList.add('hidden'); return; }
          card.classList.remove('hidden');
          const idx = check.indices || {};
          document.getElementById('pmc-indices').textContent =
            Object.entries(idx).map(([name, pct]) => `${name} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`).join(' | ') || '지수 데이터 없음';
          const up = (check.themesUp || []).map(t => `${t.theme} ${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(1)}%`).join(' / ');
          const down = (check.themesDown || []).map(t => `${t.theme} ${t.pct >= 0 ? '+' : ''}${t.pct.toFixed(1)}%`).join(' / ');
          document.getElementById('pmc-themes').innerHTML =
            (up ? `📈 ${up}<br>` : '') + (down ? `📉 ${down}` : '');
          document.getElementById('pmc-verdicts').innerHTML = (check.verdicts || []).map(v =>
            `<div class="pmc-verdict-row"><span>${v.name} <span style="color:var(--muted);font-size:11px;">${(v.themes||[]).join('/')}</span></span><span class="pmc-badge ${v.verdict}">${PMC_LABEL[v.verdict]}</span></div>`
          ).join('');
        })
        .catch(() => { document.getElementById('premarket-card').classList.add('hidden'); });
    }
  ```

- [ ] **Step 4: Call `loadPremarketCheck()` on load**

  In the `DOMContentLoaded` handler (modified in Task 1 Step 6), add the call:

  ```js
  window.addEventListener('DOMContentLoaded', ()=>{
    const urlEl = document.getElementById('sheets-url-display');
    if (urlEl) urlEl.textContent = SHEETS_URL;
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
    renderThemePills();
    initPlans();
    loadPremarketCheck();
  });
  ```

- [ ] **Step 5: Manual verification in a browser**

  After Task 6's workflow has run at least once (so `premarket_checks` has a row for today), open `index.html` in a browser and confirm:
  - The "오늘의 미장 체크" card appears at the top of the 매매 계획 tab (not hidden).
  - Indices, top-3 up/down themes, and per-stock verdict badges render with the correct colors (초록=정상, 주황=비중축소, 빨강=매수취소).
  - On a day with no `premarket_checks` row for today (e.g. test by querying a future date manually, or before the first workflow run), the card is hidden — confirms the `if (!check)` guard.

- [ ] **Step 6: Commit and push**

  ```bash
  cd /c/Users/June/jb-journal
  git add index.html
  git commit -m "feat: add premarket theme check card to journal main screen"
  git push origin main
  ```

- [ ] **STOP — Phase 5 checkpoint / final acceptance review.** Walk through all 4 acceptance criteria from the original instructions with the user:
  1. `workflow_dispatch` manual run → Telegram message arrived (confirmed in Task 6).
  2. A themed plan registered in the journal shows up correctly judged in the next run.
  3. The journal's main screen shows the check card with correct verdict colors.
  4. The 2026-07-02 backtest (Task 5) shows 유진테크's theme (반도체장비) getting 🚫 or ⚠️.
