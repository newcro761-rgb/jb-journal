# JB 단타 매매 저널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 우선 단일 HTML 파일 JB 단타 매매 저널 웹앱 — 거래 기록 입력(Google Sheets POST), 재세팅 계산기, 시트 바로가기를 3탭으로 제공.

**Architecture:** 순수 HTML/CSS/JS 단일 파일(`index.html`) + PWA용 `manifest.json` 2파일 구성. 탭 전환은 JS로 div show/hide. 모든 계산은 `oninput` 이벤트로 즉시 반영. Google Sheets 저장은 fetch POST (Apps Script Web App).

**Tech Stack:** Vanilla HTML5 / CSS3 / JavaScript ES6+, Google Apps Script Web App (POST endpoint), GitHub Pages (배포)

---

## 파일 구조

```
jb-journal/
├── index.html         ← 앱 전체 (HTML + <style> + <script>)
├── manifest.json      ← PWA 설치 설정
└── docs/
    └── superpowers/
        ├── specs/2026-06-17-jb-journal-design.md
        └── plans/2026-06-17-jb-journal.md
```

---

### Task 1: 프로젝트 초기화 + manifest.json

**Files:**
- Create: `jb-journal/manifest.json`
- Create: `jb-journal/index.html` (빈 뼈대)

- [ ] **Step 1: git 저장소 초기화**

```bash
cd C:/Users/June/jb-journal
git init
```

Expected: `Initialized empty Git repository in .../jb-journal/.git/`

- [ ] **Step 2: manifest.json 작성**

`jb-journal/manifest.json` 전체 내용:

```json
{
  "name": "JB 매매 저널",
  "short_name": "JB저널",
  "description": "JB 단타매매 거래 기록 앱",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "./index.html",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "icons": [
    {
      "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%231a1a2e'/><text y='.9em' font-size='80' x='10'>📈</text></svg>",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

- [ ] **Step 3: index.html 뼈대 작성**

`jb-journal/index.html` 전체 내용:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="JB저널">
  <meta name="theme-color" content="#1a1a2e">
  <link rel="manifest" href="manifest.json">
  <title>JB 매매 저널</title>
  <style>
    /* Task 2에서 채움 */
  </style>
</head>
<body>
  <div id="app">
    <!-- Tab 콘텐츠: Task 3~8에서 채움 -->
    <p style="color:white;text-align:center;padding:2rem;">JB 매매 저널 로딩 중...</p>
  </div>

  <!-- 하단 탭바: Task 3에서 채움 -->

  <script>
    const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL';
    const SHEETS_URL      = 'YOUR_SHEETS_URL';
    // 나머지 JS: Task 3~8에서 채움
  </script>
</body>
</html>
```

- [ ] **Step 4: 브라우저에서 파일 열기 확인**

`index.html`을 브라우저에서 열어서 "JB 매매 저널 로딩 중..." 텍스트가 흰색으로 표시되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add manifest.json index.html
git commit -m "chore: project scaffold with PWA manifest"
```

---

### Task 2: CSS 디자인 시스템 + 탭 레이아웃

**Files:**
- Modify: `index.html` — `<style>` 블록 채우기, 탭 HTML 구조 추가

- [ ] **Step 1: `<style>` 블록 전체 작성**

`index.html`의 `<style>` 태그 안에 아래 CSS를 작성:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:        #1a1a2e;
  --card:      #16213e;
  --calc-bg:   #0f3460;
  --accent:    #e94560;
  --green:     #2ed573;
  --red:       #ff4757;
  --orange:    #ffa502;
  --blue:      #1e90ff;
  --text:      #ffffff;
  --muted:     #8892a4;
  --border:    #2a3a5c;
  --input-bg:  #0d1b35;
  --tab-height: 60px;
}

html, body { height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; }

#app { max-width: 480px; margin: 0 auto; padding-bottom: calc(var(--tab-height) + 8px); min-height: 100vh; }

/* 탭 콘텐츠 */
.tab-content { display: none; padding: 16px; }
.tab-content.active { display: block; }

/* 하단 탭바 */
.tab-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  height: var(--tab-height);
  background: var(--card);
  border-top: 1px solid var(--border);
  display: flex;
  max-width: 480px;
  margin: 0 auto;
}
.tab-btn {
  flex: 1; border: none; background: none; color: var(--muted);
  font-size: 11px; cursor: pointer; padding: 6px 4px;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  transition: color 0.2s;
}
.tab-btn .icon { font-size: 22px; }
.tab-btn.active { color: var(--accent); }

/* 카드 섹션 */
.section {
  background: var(--card);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
}
.section-title {
  font-size: 12px; font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 12px;
}

/* 계산결과 카드 */
.calc-section {
  background: var(--calc-bg);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid #1e4080;
}

/* 입력 필드 */
label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; margin-top: 10px; }
label:first-child { margin-top: 0; }
input[type="text"], input[type="number"], input[type="date"], select, textarea {
  width: 100%; padding: 10px 12px;
  background: var(--input-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 15px; outline: none;
  -webkit-appearance: none; appearance: none;
}
input:focus, select:focus, textarea:focus { border-color: var(--blue); }
textarea { resize: vertical; min-height: 64px; }

/* 두 컬럼 그리드 */
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* 케이스 버튼 */
.case-btns { display: flex; gap: 8px; }
.case-btn {
  flex: 1; padding: 10px; border: 2px solid var(--border);
  background: var(--input-bg); color: var(--muted);
  border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.15s;
}
.case-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(233,69,96,0.1); }

/* Pill 버튼 (매수 이유) */
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pill {
  padding: 6px 12px; border-radius: 20px;
  border: 1px solid var(--border); background: var(--input-bg);
  color: var(--muted); font-size: 13px; cursor: pointer;
  transition: all 0.15s;
}
.pill.active { border-color: var(--blue); color: var(--blue); background: rgba(30,144,255,0.1); }

/* 계산 결과 행 */
.calc-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.06);
  font-size: 14px;
}
.calc-row:last-child { border-bottom: none; }
.calc-label { color: var(--muted); }
.calc-val { font-weight: 600; font-size: 15px; }
.calc-val.red { color: var(--red); }
.calc-val.green { color: var(--green); }
.calc-val.orange { color: var(--orange); }

/* 재세팅 계산기 입력 */
.reset-input { background: rgba(255,165,2,0.08); border-color: rgba(255,165,2,0.3); }

/* 저장 버튼 */
.save-btn {
  width: 100%; padding: 14px;
  background: var(--accent); color: white;
  border: none; border-radius: 10px;
  font-size: 16px; font-weight: 700; cursor: pointer;
  margin-top: 4px; transition: opacity 0.2s;
}
.save-btn:active { opacity: 0.8; }

/* 시트 열기 버튼 */
.sheets-btn {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px;
  width: 100%; padding: 40px 20px;
  background: var(--card); border: 2px solid var(--border);
  border-radius: 16px; color: var(--text);
  font-size: 18px; font-weight: 600; cursor: pointer;
  text-decoration: none; margin-top: 20px;
  transition: border-color 0.2s;
}
.sheets-btn:active { border-color: var(--green); }
.sheets-btn .big-icon { font-size: 48px; }

/* 토스트 메시지 */
#toast {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
  background: #333; color: white; padding: 10px 20px; border-radius: 8px;
  font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none;
  white-space: nowrap; z-index: 999;
}
#toast.show { opacity: 1; }

/* 숨김 */
.hidden { display: none !important; }

/* 페이지 타이틀 */
.page-title {
  font-size: 18px; font-weight: 700; color: var(--text);
  padding: 16px 0 4px; margin-bottom: 4px;
}
```

- [ ] **Step 2: body 안에 탭 HTML 구조 추가**

`<body>` 안의 `<div id="app">` 전체를 아래로 교체:

```html
<div id="app">
  <!-- 탭 콘텐츠 -->
  <div id="tab-entry"  class="tab-content active"></div>
  <div id="tab-reset"  class="tab-content"></div>
  <div id="tab-sheets" class="tab-content"></div>
</div>

<!-- 하단 탭바 -->
<nav class="tab-bar">
  <button class="tab-btn active" onclick="switchTab('entry',  this)">
    <span class="icon">📝</span><span>입력</span>
  </button>
  <button class="tab-btn" onclick="switchTab('reset', this)">
    <span class="icon">🔄</span><span>재세팅</span>
  </button>
  <button class="tab-btn" onclick="switchTab('sheets', this)">
    <span class="icon">📊</span><span>시트</span>
  </button>
</nav>

<div id="toast"></div>
```

- [ ] **Step 3: `<script>` 안에 탭 전환 함수 추가**

`<script>` 태그 안 기존 플레이스홀더 아래에 추가:

```js
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}
```

- [ ] **Step 4: 브라우저에서 탭 전환 확인**

브라우저에서 `index.html` 열기. 하단에 3개 탭이 보이고, 각 탭 클릭 시 active 탭만 보이는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: CSS design system + tab navigation shell"
```

---

### Task 3: 탭 1 — 케이스 선택 + 종목 기본 정보

**Files:**
- Modify: `index.html` — `#tab-entry` 내용 채우기 (케이스 버튼 + 종목 정보)

- [ ] **Step 1: `#tab-entry` 안에 케이스 선택 + 종목 정보 HTML 추가**

`<div id="tab-entry" ...>` 안에 아래 내용 삽입:

```html
<div class="page-title">거래 입력</div>

<!-- 케이스 선택 -->
<div class="section">
  <div class="section-title">케이스</div>
  <div class="case-btns">
    <button class="case-btn active" onclick="setCase(1, this)">케이스1<br><small style="font-weight:400;font-size:11px">1차만</small></button>
    <button class="case-btn" onclick="setCase(2, this)">케이스2<br><small style="font-weight:400;font-size:11px">1+2차</small></button>
    <button class="case-btn" onclick="setCase(3, this)">케이스3<br><small style="font-weight:400;font-size:11px">손절</small></button>
  </div>
</div>

<!-- 종목 정보 -->
<div class="section">
  <div class="section-title">종목 정보</div>
  <label>종목명</label>
  <input type="text" id="stockName" placeholder="예: 삼성전자" oninput="calcAll()">
  <div class="row2">
    <div>
      <label>종목코드</label>
      <input type="text" id="stockCode" placeholder="005930" oninput="calcAll()">
    </div>
    <div>
      <label>매수일</label>
      <input type="date" id="buyDate" oninput="calcAll()">
    </div>
  </div>
</div>
```

- [ ] **Step 2: `<script>` 에 케이스 상태 + setCase 함수 추가**

```js
let currentCase = 1;

function setCase(n, btn) {
  currentCase = n;
  document.querySelectorAll('.case-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const sec2 = document.getElementById('section-buy2');
  if (sec2) sec2.classList.toggle('hidden', n === 1);
  calcAll();
}
```

- [ ] **Step 3: 브라우저에서 확인**

탭 1 열기 → 케이스 버튼 3개가 나타나고 클릭 시 해당 버튼만 강조(빨간 테두리)되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: tab1 case selector + stock info fields"
```

---

### Task 4: 탭 1 — 매수 입력 + 자동 계산

**Files:**
- Modify: `index.html` — 1차/2차 매수 섹션 + 계산 결과 섹션

- [ ] **Step 1: 종목 정보 섹션 아래에 매수 입력 HTML 추가**

`<!-- 종목 정보 -->` 섹션 닫는 `</div>` 바로 뒤에 추가:

```html
<!-- 1차 매수 -->
<div class="section">
  <div class="section-title">1차 매수</div>
  <div class="row2">
    <div>
      <label>매수가 (원)</label>
      <input type="number" id="buy1Price" placeholder="10000" oninput="calcAll()">
    </div>
    <div>
      <label>수량 (주)</label>
      <input type="number" id="buy1Qty" placeholder="100" oninput="calcAll()">
    </div>
  </div>
  <div id="calc-sl1-row" class="calc-row" style="margin-top:10px;">
    <span class="calc-label">1차 손절가</span>
    <span class="calc-val red" id="calc-sl1">—</span>
  </div>
</div>

<!-- 2차 매수 (케이스1이면 숨김) -->
<div class="section hidden" id="section-buy2">
  <div class="section-title">2차 매수</div>
  <div class="row2">
    <div>
      <label>매수가 (원)</label>
      <input type="number" id="buy2Price" placeholder="9500" oninput="calcAll()">
    </div>
    <div>
      <label>수량 (주)</label>
      <input type="number" id="buy2Qty" placeholder="100" oninput="calcAll()">
    </div>
  </div>
</div>

<!-- 자동 계산 결과 -->
<div class="calc-section">
  <div class="section-title" style="color:#7eb8f7;">자동 계산</div>
  <div class="calc-row">
    <span class="calc-label">평균단가</span>
    <span class="calc-val" id="calc-avg">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">통합 손절가</span>
    <span class="calc-val red" id="calc-sl">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">1차 목표 (+3%)</span>
    <span class="calc-val green" id="calc-t1">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">2차 목표 (+5%)</span>
    <span class="calc-val green" id="calc-t2">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">3차 목표 (+7%)</span>
    <span class="calc-val green" id="calc-t3">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">총 매수금액</span>
    <span class="calc-val" id="calc-total-amt">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">최대 손실액</span>
    <span class="calc-val red" id="calc-max-loss">—</span>
  </div>
</div>
```

- [ ] **Step 2: `calcAll` 함수 작성 (script 태그 안)**

```js
function n(id) { return parseFloat(document.getElementById(id).value) || 0; }
function fmt(v) { return v ? Math.round(v).toLocaleString('ko-KR') + '원' : '—'; }
function fmtPct(v) { return v ? (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%' : '—'; }

function calcAll() {
  const b1 = n('buy1Price'), q1 = n('buy1Qty');
  const b2 = n('buy2Price'), q2 = n('buy2Qty');
  const sell = n('sellPrice');
  const use2 = currentCase !== 1 && b2 > 0 && q2 > 0;

  const avg = use2 ? (b1 * q1 + b2 * q2) / (q1 + q2) : b1;
  const totalQty = use2 ? q1 + q2 : q1;
  const totalAmt = b1 * q1 + (use2 ? b2 * q2 : 0);

  const sl1 = b1 > 0 ? Math.round(b1 * 0.93) : 0;
  const sl  = avg > 0 ? Math.round(avg * 0.93) : 0;
  const t1  = avg > 0 ? Math.round(avg * 1.03) : 0;
  const t2  = avg > 0 ? Math.round(avg * 1.05) : 0;
  const t3  = avg > 0 ? Math.round(avg * 1.07) : 0;
  const maxLoss = totalAmt > 0 ? Math.round(totalAmt * 0.07) : 0;

  const profit = (sell > 0 && avg > 0 && totalQty > 0) ? Math.round((sell - avg) * totalQty) : null;
  const rate   = (sell > 0 && avg > 0) ? (sell - avg) / avg : null;
  const sellAmt = sell > 0 && totalQty > 0 ? sell * totalQty : 0;
  const fee    = Math.round((totalAmt + sellAmt) * 0.00015);
  const netProfit = profit !== null ? profit - fee : null;

  set('calc-sl1',       sl1 > 0 ? Math.round(sl1).toLocaleString('ko-KR') + '원' : '—');
  set('calc-avg',       avg > 0 ? Math.round(avg).toLocaleString('ko-KR') + '원' : '—');
  set('calc-sl',        sl > 0  ? sl.toLocaleString('ko-KR') + '원' : '—');
  set('calc-t1',        t1 > 0  ? t1.toLocaleString('ko-KR') + '원' : '—');
  set('calc-t2',        t2 > 0  ? t2.toLocaleString('ko-KR') + '원' : '—');
  set('calc-t3',        t3 > 0  ? t3.toLocaleString('ko-KR') + '원' : '—');
  set('calc-total-amt', totalAmt > 0 ? totalAmt.toLocaleString('ko-KR') + '원' : '—');
  set('calc-max-loss',  maxLoss > 0  ? maxLoss.toLocaleString('ko-KR') + '원' : '—');

  if (document.getElementById('calc-profit')) {
    const profitEl = document.getElementById('calc-profit');
    const rateEl   = document.getElementById('calc-rate');
    const netEl    = document.getElementById('calc-net-profit');
    profitEl.textContent = profit !== null ? (profit >= 0 ? '+' : '') + profit.toLocaleString('ko-KR') + '원' : '—';
    profitEl.className   = 'calc-val ' + (profit > 0 ? 'green' : profit < 0 ? 'red' : '');
    rateEl.textContent   = rate !== null ? fmtPct(rate) : '—';
    rateEl.className     = 'calc-val ' + (rate > 0 ? 'green' : rate < 0 ? 'red' : '');
    if (netEl) {
      netEl.textContent = netProfit !== null ? (netProfit >= 0 ? '+' : '') + netProfit.toLocaleString('ko-KR') + '원' : '—';
      netEl.className   = 'calc-val ' + (netProfit > 0 ? 'green' : netProfit < 0 ? 'red' : '');
    }
  }
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
```

- [ ] **Step 3: 브라우저 콘솔에서 calcAll 동작 확인**

브라우저 열기 → 콘솔에서:
```js
document.getElementById('buy1Price').value = 10000;
document.getElementById('buy1Qty').value   = 100;
calcAll();
// 예상: calc-sl1 → "9,300원", calc-avg → "10,000원", calc-t1 → "10,300원"
```

화면에 계산값이 반영되면 통과.

- [ ] **Step 4: 케이스2 선택 후 2차 매수 섹션 표시 확인**

케이스2 버튼 클릭 → `#section-buy2`가 나타나는지 확인.  
케이스1 클릭 → 다시 숨겨지는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: tab1 purchase inputs + auto-calculation logic"
```

---

### Task 5: 탭 1 — 매도 정보 + 상태 + 매수 이유 + 메모 + 저장 버튼

**Files:**
- Modify: `index.html` — 매도 섹션, 상태, 이유 pill, 메모, 저장 버튼 추가

- [ ] **Step 1: 계산결과 섹션(`calc-section`) 아래에 매도 + 수익 섹션 HTML 추가**

```html
<!-- 매도 정보 -->
<div class="section">
  <div class="section-title">매도 정보</div>
  <div class="row2">
    <div>
      <label>실제 매도가 (원)</label>
      <input type="number" id="sellPrice" placeholder="10300" oninput="calcAll()">
    </div>
    <div>
      <label>매도일</label>
      <input type="date" id="sellDate" oninput="calcAll()">
    </div>
  </div>
  <div style="margin-top:10px;">
    <div class="calc-row">
      <span class="calc-label">수익금 (세전)</span>
      <span class="calc-val" id="calc-profit">—</span>
    </div>
    <div class="calc-row">
      <span class="calc-label">수익률</span>
      <span class="calc-val" id="calc-rate">—</span>
    </div>
    <div class="calc-row">
      <span class="calc-label">순수익 (수수료 제외)</span>
      <span class="calc-val" id="calc-net-profit">—</span>
    </div>
  </div>
</div>

<!-- 상태 -->
<div class="section">
  <div class="section-title">상태</div>
  <select id="tradeStatus">
    <option value="보유중">보유중</option>
    <option value="수익(1차만)">수익 — 1차만 매도</option>
    <option value="수익(2차까지)">수익 — 2차까지 매도</option>
    <option value="손절(1차만)">손절 — 1차만</option>
    <option value="손절(2차까지)">손절 — 2차까지</option>
  </select>
</div>

<!-- 매수 이유 -->
<div class="section">
  <div class="section-title">매수 이유</div>
  <div class="pills" id="reason-pills">
    <button class="pill" onclick="togglePill(this)">기준봉 돌파</button>
    <button class="pill" onclick="togglePill(this)">1선 눌림목</button>
    <button class="pill" onclick="togglePill(this)">2선 눌림목</button>
    <button class="pill" onclick="togglePill(this)">대장주</button>
    <button class="pill" onclick="togglePill(this)">테마주</button>
    <button class="pill" onclick="togglePill(this)">섹터주</button>
    <button class="pill" onclick="togglePill(this)">뉴스 모멘텀</button>
    <button class="pill" onclick="togglePill(this)">상대강도</button>
  </div>
</div>

<!-- 메모 -->
<div class="section">
  <div class="section-title">메모</div>
  <textarea id="memo" placeholder="특이사항, 반성, 개선점 등..."></textarea>
</div>

<!-- 저장 버튼 -->
<button class="save-btn" onclick="saveTrade()">저장하기</button>
```

- [ ] **Step 2: `<script>`에 pill 토글 함수 추가**

```js
function togglePill(btn) {
  btn.classList.toggle('active');
}

function getReasons() {
  return Array.from(document.querySelectorAll('#reason-pills .pill.active'))
    .map(b => b.textContent).join(', ');
}
```

- [ ] **Step 3: 브라우저에서 pill 토글 확인**

"기준봉 돌파" 버튼 클릭 → 파란색 강조되는지 확인. 다시 클릭 → 해제 확인.

- [ ] **Step 4: 매도가 입력 시 수익금 계산 확인**

1차 매수가 10000, 수량 100 입력 → 매도가 10300 입력.  
수익금 `+30,000원`, 수익률 `+3.00%` 표시되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: tab1 sell info, status, reason pills, memo, save button"
```

---

### Task 6: 탭 1 — Google Sheets POST 저장

**Files:**
- Modify: `index.html` — `saveTrade` 함수 + `showToast` 유틸

- [ ] **Step 1: `<script>`에 `saveTrade` 함수 추가**

```js
function saveTrade() {
  const b1 = n('buy1Price'), q1 = n('buy1Qty');
  const b2 = n('buy2Price'), q2 = n('buy2Qty');
  const sell = n('sellPrice');
  const use2 = currentCase !== 1 && b2 > 0 && q2 > 0;

  if (!b1 || !q1) { showToast('1차 매수가와 수량을 입력하세요.'); return; }

  const avg      = use2 ? (b1*q1 + b2*q2)/(q1+q2) : b1;
  const totalQty = use2 ? q1+q2 : q1;
  const totalAmt = b1*q1 + (use2 ? b2*q2 : 0);
  const sellAmt  = sell > 0 ? sell * totalQty : 0;

  const row = [
    document.getElementById('buyDate').value,                          // [1] 매수일
    document.getElementById('stockName').value,                        // [2] 종목명
    document.getElementById('stockCode').value,                        // [3] 종목코드
    b1,                                                                // [4] 1차 매수가
    q1,                                                                // [5] 1차 수량
    b1 * q1,                                                           // [6] 1차 총액
    Math.round(b1 * 1.03),                                             // [7] 1차 목표가
    use2 ? b2 : '',                                                    // [8] 2차 매수가
    use2 ? q2 : '',                                                    // [9] 2차 수량
    use2 ? b2*q2 : '',                                                 // [10] 2차 총액
    Math.round(avg),                                                   // [11] 평균단가
    totalAmt,                                                          // [12] 총 매수금액
    Math.round(avg * 0.93),                                            // [13] 통합 손절가
    Math.round(avg * 1.03),                                            // [14] 통합 1차 목표
    Math.round(avg * 1.05),                                            // [15] 통합 2차 목표
    Math.round(avg * 1.07),                                            // [16] 통합 3차 목표
    Math.round(totalAmt * 0.07),                                       // [17] 최대 손실액
    document.getElementById('sellDate').value,                         // [18] 매도일
    sell || '',                                                        // [19] 실제 매도가
    sell > 0 ? Math.round((sell - avg) * totalQty) : '',              // [20] 수익금
    sell > 0 ? ((sell - avg) / avg).toFixed(4) : '',                  // [21] 수익률
    '',                                                                // [22] 빈칸
    document.getElementById('tradeStatus').value,                     // [23] 상태
    '케이스' + currentCase,                                             // [24] 케이스
    getReasons(),                                                      // [25] 매수 이유
    '', '', '', '',                                                    // [26~29] 빈칸
    document.getElementById('memo').value                             // [30] 메모
  ];

  const btn = document.querySelector('.save-btn');
  btn.textContent = '저장 중...';
  btn.disabled = true;

  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ row }),
    headers: { 'Content-Type': 'application/json' }
  })
    .then(r => r.text())
    .then(() => { showToast('✅ 저장 완료!'); resetForm(); })
    .catch(() => showToast('❌ 저장 실패. URL 설정을 확인하세요.'))
    .finally(() => { btn.textContent = '저장하기'; btn.disabled = false; });
}

function resetForm() {
  ['stockName','stockCode','buyDate','buy1Price','buy1Qty',
   'buy2Price','buy2Qty','sellPrice','sellDate','memo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('tradeStatus').value = '보유중';
  document.querySelectorAll('.pill.active').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.case-btn').forEach((b, i) => {
    b.classList.toggle('active', i === 0);
  });
  currentCase = 1;
  document.getElementById('section-buy2').classList.add('hidden');
  calcAll();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
```

- [ ] **Step 2: 브라우저에서 APPS_SCRIPT_URL 플레이스홀더 상태로 저장 버튼 동작 확인**

저장 버튼 클릭 → "❌ 저장 실패. URL 설정을 확인하세요." 토스트가 표시되면 정상 (URL이 없으므로 실패가 맞는 동작).

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: tab1 Google Sheets POST save + form reset + toast"
```

---

### Task 7: 탭 2 — 재세팅 계산기

**Files:**
- Modify: `index.html` — `#tab-reset` 내용 채우기

- [ ] **Step 1: `#tab-reset` 안에 HTML 추가**

```html
<div class="page-title">재세팅 계산기</div>
<p style="color:var(--muted);font-size:13px;margin-bottom:14px;">2차 체결 알림 수신 즉시 → 키움 0624 화면에서 조건전체삭제 → 아래 값으로 재세팅</p>

<!-- 입력 -->
<div class="section" style="border-color:rgba(255,165,2,0.4);">
  <div class="section-title" style="color:var(--orange);">입력</div>
  <div class="row2">
    <div>
      <label>1차 매수가</label>
      <input type="number" id="r-buy1" placeholder="10000" class="reset-input" oninput="calcReset()">
    </div>
    <div>
      <label>1차 수량</label>
      <input type="number" id="r-qty1" placeholder="100" class="reset-input" oninput="calcReset()">
    </div>
  </div>
  <div class="row2">
    <div>
      <label>2차 체결가</label>
      <input type="number" id="r-buy2" placeholder="9500" class="reset-input" oninput="calcReset()">
    </div>
    <div>
      <label>2차 수량</label>
      <input type="number" id="r-qty2" placeholder="100" class="reset-input" oninput="calcReset()">
    </div>
  </div>
</div>

<!-- 결과 -->
<div class="calc-section" style="border-color:rgba(255,165,2,0.3);">
  <div class="section-title" style="color:var(--orange);">재세팅 값</div>
  <div class="calc-row">
    <span class="calc-label">새 평균단가</span>
    <span class="calc-val orange" id="r-avg">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">재세팅 손절가</span>
    <span class="calc-val red" id="r-sl">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">1차 목표가 (+3%)</span>
    <span class="calc-val green" id="r-t1">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">2차 목표가 (+5%)</span>
    <span class="calc-val green" id="r-t2">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">3차 목표가 (+7%)</span>
    <span class="calc-val green" id="r-t3">—</span>
  </div>
</div>

<!-- 분할매도 수량 -->
<div class="calc-section" style="border-color:rgba(255,165,2,0.3);">
  <div class="section-title" style="color:var(--orange);">분할 매도 수량</div>
  <div class="calc-row">
    <span class="calc-label">총 보유수량</span>
    <span class="calc-val" id="r-total-qty">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">1차 매도 (40%)</span>
    <span class="calc-val" id="r-s1">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">2차 매도 (잔여 67%)</span>
    <span class="calc-val" id="r-s2">—</span>
  </div>
  <div class="calc-row">
    <span class="calc-label">3차 매도 (나머지)</span>
    <span class="calc-val" id="r-s3">—</span>
  </div>
</div>
```

- [ ] **Step 2: `<script>`에 `calcReset` 함수 추가**

`n()` 함수는 Task 4에서 이미 정의됨 — 재정의 없이 그대로 사용.

```js
function calcReset() {
  const b1 = n('r-buy1'), q1 = n('r-qty1');
  const b2 = n('r-buy2'), q2 = n('r-qty2');

  if (!b1 || !q1 || !b2 || !q2) return;

  const avg      = (b1*q1 + b2*q2) / (q1+q2);
  const totalQty = q1 + q2;
  const sl       = Math.round(avg * 0.93);
  const t1       = Math.round(avg * 1.03);
  const t2       = Math.round(avg * 1.05);
  const t3       = Math.round(avg * 1.07);
  const s1       = Math.round(totalQty * 0.4);
  const s2       = Math.round((totalQty - s1) * 0.67);
  const s3       = totalQty - s1 - s2;

  set('r-avg',       Math.round(avg).toLocaleString('ko-KR') + '원');
  set('r-sl',        sl.toLocaleString('ko-KR') + '원');
  set('r-t1',        t1.toLocaleString('ko-KR') + '원');
  set('r-t2',        t2.toLocaleString('ko-KR') + '원');
  set('r-t3',        t3.toLocaleString('ko-KR') + '원');
  set('r-total-qty', totalQty + '주');
  set('r-s1',        s1 + '주');
  set('r-s2',        s2 + '주');
  set('r-s3',        s3 + '주');
}
```

- [ ] **Step 3: 브라우저에서 재세팅 계산기 확인**

탭 2 선택 → 입력값 채우기:
- 1차 매수가: 10000, 1차 수량: 100
- 2차 체결가: 9500, 2차 수량: 100

예상 결과:
- 새 평균단가: `9,750원`
- 재세팅 손절가: `9,067원`
- 1차 목표가: `10,042원`
- 총 보유수량: `200주`
- 1차 매도: `80주`, 2차 매도: `80주`, 3차 매도: `40주`

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: tab2 reset calculator with split-sell quantities"
```

---

### Task 8: 탭 3 — 시트 열기

**Files:**
- Modify: `index.html` — `#tab-sheets` 내용 채우기

- [ ] **Step 1: `#tab-sheets` 안에 HTML 추가**

```html
<div class="page-title">시트 열기</div>
<p style="color:var(--muted);font-size:13px;margin-bottom:8px;">거래 기록이 저장된 Google Sheets를 엽니다.</p>

<a class="sheets-btn" onclick="openSheets()" href="javascript:void(0)">
  <span class="big-icon">📊</span>
  <span>Google Sheets 열기</span>
  <span style="font-size:13px;color:var(--muted);font-weight:400;">거래 내역 확인 / 수정</span>
</a>

<div style="margin-top:32px; padding: 16px; background:var(--card); border-radius:12px; border:1px solid var(--border);">
  <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">URL 설정</div>
  <div style="font-size:13px;color:var(--text);word-break:break-all;" id="sheets-url-display">YOUR_SHEETS_URL</div>
</div>
```

- [ ] **Step 2: `<script>`에 `openSheets` 함수 추가 + URL 표시 초기화**

```js
function openSheets() {
  if (SHEETS_URL === 'YOUR_SHEETS_URL') {
    showToast('SHEETS_URL을 index.html에서 설정해주세요.');
    return;
  }
  window.open(SHEETS_URL, '_blank');
}

// 페이지 로드 시 URL 표시 업데이트
window.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('sheets-url-display');
  if (el) el.textContent = SHEETS_URL;
});
```

- [ ] **Step 3: 브라우저에서 탭 3 확인**

탭 3 클릭 → 큰 버튼이 보이고, 버튼 클릭 시 "SHEETS_URL을 index.html에서 설정해주세요." 토스트 표시되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: tab3 Google Sheets link with URL placeholder guard"
```

---

### Task 9: 최종 점검 + GitHub Pages 배포

**Files:**
- Modify: `index.html` — 메타태그 / 접근성 / 최종 정리

- [ ] **Step 1: 모바일 UI 최종 점검 체크리스트**

브라우저 DevTools → 모바일 에뮬레이터(iPhone 12, 390px) 로 아래 항목 확인:
- [ ] 탭 1: 케이스 버튼 3개가 가로로 균등 배치
- [ ] 탭 1: 케이스1 선택 시 "2차 매수" 섹션 숨김
- [ ] 탭 1: 케이스2 선택 시 "2차 매수" 섹션 노출
- [ ] 탭 1: 매수가/수량 입력 즉시 계산 결과 반영
- [ ] 탭 1: 매도가 입력 시 수익금/수익률 반영
- [ ] 탭 1: 저장 버튼 → 실패 토스트 표시
- [ ] 탭 2: 4개 입력 후 모든 결과값 정확히 표시
- [ ] 탭 3: 시트 열기 버튼 → 플레이스홀더 토스트
- [ ] 하단 탭바 고정 — 스크롤해도 탭바가 고정되는지

- [ ] **Step 2: `<head>`에 추가 메타태그 확인**

아래 태그들이 `<head>`에 있는지 확인:

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="JB저널">
<meta name="theme-color" content="#1a1a2e">
<link rel="manifest" href="manifest.json">
```

- [ ] **Step 3: GitHub 저장소 생성 + 배포**

```bash
# GitHub에서 jb-journal 저장소 생성 후:
git remote add origin https://github.com/YOUR_USERNAME/jb-journal.git
git branch -M main
git push -u origin main
```

GitHub.com → 저장소 → Settings → Pages → Source: `main` / `/ (root)` → Save

- [ ] **Step 4: GitHub Pages URL 접속 확인**

`https://YOUR_USERNAME.github.io/jb-journal` 에서 앱이 정상 작동하는지 확인.

- [ ] **Step 5: 폰 홈화면 추가 확인**

iPhone Safari: 공유 버튼 → "홈 화면에 추가" → "JB저널" 아이콘으로 앱처럼 열리는지 확인.  
Android Chrome: 주소창 오른쪽 메뉴 → "홈 화면에 추가"

- [ ] **Step 6: 최종 커밋**

```bash
git add -A
git commit -m "feat: JB 매매 저널 완성 - PWA, 3탭, 재세팅 계산기, Sheets 연동"
git push
```

---

## Apps Script 설정 가이드 (앱 완성 후)

Apps Script URL 발급 후 `index.html` 상단 2줄만 교체:

```js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
const SHEETS_URL      = 'https://docs.google.com/spreadsheets/d/YOUR_ID/edit';
```

Apps Script 코드 (`doPost`):

```js
function doPost(e) {
  const data  = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow(data.row);
  return ContentService
    .createTextOutput(JSON.stringify({ result: 'OK' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

배포: Apps Script → 배포 → 새 배포 → 웹 앱 → 액세스: **모든 사용자** → 배포 → URL 복사.
