# 계획 탭 주문날짜/D+n 표시 + 장세 태깅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대기목록 카드에 주문날짜+경과 거래일(D+n, 3일 이상 강조)을 항상 표시하고, 종목 추가 시 장세(상승장/박스장/하락장)를 선택하게 해서 완료된 거래/Sheets까지 보존되게 한다. "입력" 탭(수동 백필 폼)에도 동일한 장세 선택을 추가한다.

**Architecture:** 프론트엔드(`index.html`) 변경이 메인이지만, `plan.regime`은 대기 중에도(새로고침/기기 전환에도) 유지되어야 하는 plan-level 필드라 `apps-script/Code.gs`의 `Plans` 시트에 컬럼을 추가해야 한다(staged-sell 때와 달리 이번엔 백엔드 변경 + 수동 재배포가 불가피함 — 사용자 확인됨). 날짜는 `plan.date`를 한글 로케일 문자열(`"2026. 6. 24."`)에서 ISO(`"YYYY-MM-DD"`)로 저장 방식을 바꾸되, 기존 7건의 대기 plan이 쓰는 옛 형식도 파싱 가능하게 듀얼 포맷 파서를 둔다.

**Tech Stack:** Vanilla HTML5/CSS3/JS, Google Apps Script Web App(컬럼 추가 + 수동 재배포 필요), localStorage, GitHub Pages.

## Global Constraints

- 변경 범위는 "계획" 탭(추가 폼 + 대기목록 카드 + finalize 시 Sheets row)과 "입력" 탭(수동 백필 폼)에 한정한다. 결과 입력 모달(phase/use2/sell rows)은 건드리지 않는다.
- 경과 거래일 계산은 주말(토/일)만 제외하고 공휴일은 셈에 포함한다(설계 문서 Non-Goals).
- `D+n`이 **3 이상**이면 경고 표시(`docs/superpowers/specs/2026-06-26-plan-orderdate-regime-design.md`의 "보수적으로 D+3부터 경고" 결정).
- 장세 내부값은 `'up'|'box'|'down'`, 화면 표시는 `상승장`/`박스장`/`하락장`. 매핑은 전역 상수 `REGIME_LABEL`로 한 곳에서만 정의하고 모든 화면/시트 출력이 이걸 참조한다.
- 메인 내역 시트에서 `finalizePlan()`(31열)과 `saveTrade()`(30열) 두 row 배열은 24/25/30번째 칸(1-indexed)의 의미가 이미 서로 다르다(기존 불일치, 이번 작업과 무관, 손대지 않음). 장세는 **두 배열 모두 진짜로 비어있는 26번째 칸(0-indexed 25)**에 쓴다.
- 설계 문서: `docs/superpowers/specs/2026-06-26-plan-orderdate-regime-design.md`.

---

### Task 1: CSS — 장세 버튼, 주문일 표시, 배지 스타일

**Files:**
- Modify: `jb-journal/index.html:165-166` (CSS, `</style>` 바로 앞)

**Interfaces:**
- Produces: `.regime-btns`, `.regime-btn`(+`.active.r-up/.r-box/.r-down`), `.pc-regime`(+`.r-up/.r-box/.r-down`), `.pc-order-date`(+`.warn`) CSS 클래스. Task 3, 4, 7이 이 클래스들을 사용.

- [ ] **Step 1: CSS 블록 삽입**

다음을 찾아:

```css
    /* 서브탭 */
    .subtab-bar { display: flex; gap: 8px; }
    .subtab-btn { flex: 1; padding: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--muted); border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .subtab-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(233,69,96,0.1); }
  </style>
```

아래로 교체:

```css
    /* 서브탭 */
    .subtab-bar { display: flex; gap: 8px; }
    .subtab-btn { flex: 1; padding: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--muted); border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .subtab-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(233,69,96,0.1); }

    /* 장세 버튼 + 대기목록 주문일/장세 배지 */
    .regime-btns { display: flex; gap: 8px; }
    .regime-btn {
      flex: 1; padding: 10px 4px; border: 2px solid var(--border); background: var(--input-bg);
      color: var(--muted); border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: center;
    }
    .regime-btn.active.r-up   { border-color: var(--green);  color: var(--green);  background: rgba(46,213,115,0.1); }
    .regime-btn.active.r-box  { border-color: var(--orange); color: var(--orange); background: rgba(255,165,2,0.1); }
    .regime-btn.active.r-down { border-color: var(--red);    color: var(--red);    background: rgba(255,71,87,0.1); }
    .pc-regime {
      display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px;
      border-radius: 8px; margin-bottom: 4px;
    }
    .pc-regime.r-up   { background: rgba(46,213,115,0.15); color: var(--green); }
    .pc-regime.r-box  { background: rgba(255,165,2,0.15);  color: var(--orange); }
    .pc-regime.r-down { background: rgba(255,71,87,0.15);  color: var(--red); }
    .pc-order-date { font-size: 10px; color: var(--muted); margin-bottom: 6px; }
    .pc-order-date.warn { color: var(--red); font-weight: 700; }
  </style>
```

- [ ] **Step 2: 브라우저에서 깨짐 없는지 확인**

`index.html`을 브라우저에서 열고 콘솔에 CSS 파싱 에러가 없는지, 기존 탭들이 평소처럼 보이는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: add CSS for regime buttons and plan order-date display"
```

---

### Task 2: 날짜 파서 + 경과거래일 계산 + 장세 라벨 상수

**Files:**
- Modify: `jb-journal/index.html:405-409` (상태 선언부, `REGIME_LABEL` 추가)
- Modify: `jb-journal/index.html` — `renderPlans()` 바로 앞(현재 511번째 줄 부근)에 새 함수 두 개 삽입

**Interfaces:**
- Produces: `REGIME_LABEL` (object, `{up:'상승장', box:'박스장', down:'하락장'}`), `function parsePlanDate(str)` → `Date|null`, `function tradingDaysSince(str)` → `number|null`.
- Consumed by: Task 3(`addPlan`), Task 4(`renderPlans`), Task 6(`finalizePlan`), Task 7(`saveTrade`).

- [ ] **Step 1: `REGIME_LABEL` 상수 추가**

다음을 찾아:

```js
  /* ── 상태 ── */
  let currentCase = 1;
  let p2manual = false;      // 2차 매수가 수동 입력 여부
  let modalPlanId = null;    // 현재 모달에 열린 plan id
  let modalUse2 = true;      // 모달에서 2차 매수 실제 체결 여부 토글 상태
```

아래로 교체:

```js
  /* ── 상태 ── */
  let currentCase = 1;
  let p2manual = false;      // 2차 매수가 수동 입력 여부
  let modalPlanId = null;    // 현재 모달에 열린 plan id
  let modalUse2 = true;      // 모달에서 2차 매수 실제 체결 여부 토글 상태
  const REGIME_LABEL = { up: '상승장', box: '박스장', down: '하락장' };
```

- [ ] **Step 2: `parsePlanDate()` / `tradingDaysSince()` 추가**

다음을 찾아(`renderPlans` 함수 바로 앞):

```js
  function renderPlans() {
```

위에 삽입(이 줄은 그대로 두고 바로 위에 추가):

```js
  // ISO("YYYY-MM-DD")와 기존 한글 로케일("2026. 6. 24.") 둘 다 인식.
  // 매칭 실패 시 null — 호출부는 null이면 D+n을 표시하지 않고 날짜 원문만 보여준다.
  function parsePlanDate(str) {
    if (!str) return null;
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = str.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  // 주문일~오늘 사이 평일(월~금)만 카운트. 공휴일은 셈에 포함(Non-Goals).
  function tradingDaysSince(str) {
    const start = parsePlanDate(str);
    if (!start) return null;
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let count = 0;
    while (d < today) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  }

  function renderPlans() {
```

- [ ] **Step 3: 브라우저 콘솔에서 동작 확인**

```js
console.log(parsePlanDate('2026-06-24'));     // Expected: Wed Jun 24 2026 00:00:00 (로컬 타임존)
console.log(parsePlanDate('2026. 6. 24.'));   // Expected: 위와 동일한 날짜
console.log(parsePlanDate('garbage'));        // Expected: null
console.log(tradingDaysSince('2026-06-24'));  // 오늘이 2026-06-26(금)이라면 Expected: 2 (6/24 수, 6/25 목 — 평일 2일)
```

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: add parsePlanDate/tradingDaysSince helpers and REGIME_LABEL map"
```

---

### Task 3: 계획 추가 폼 — 장세 선택 버튼 + 검증 + 날짜 저장 형식 변경

**Files:**
- Modify: `jb-journal/index.html:181-227` (추가 폼 HTML)
- Modify: `jb-journal/index.html:482-504` (`addPlan`)

**Interfaces:**
- Consumes: Task 2의 `REGIME_LABEL`(키 목록 `up/box/down` 확인용으로 간접 참조).
- Produces: 전역 상태 `planRegime`(`'up'|'box'|'down'|null`), `function setPlanRegime(val, btn)`. `plan.regime` 필드, `plan.date`가 ISO 형식으로 저장.
- Consumed by: Task 4(`renderPlans`가 `p.regime`/`p.date` 읪음), Task 5(Apps Script가 `p.regime` 전송받음).

- [ ] **Step 1: 추가 폼 HTML에 장세 버튼 삽입**

다음을 찾아:

```html
    <!-- 추가 폼 -->
    <div id="subtab-add" class="hidden">
      <div class="section" style="margin-top:12px;">
        <div class="row2">
          <div>
            <label>종목명</label>
            <input type="text" id="p-name" placeholder="삼성전자">
          </div>
```

아래로 교체:

```html
    <!-- 추가 폼 -->
    <div id="subtab-add" class="hidden">
      <div class="section" style="margin-top:12px;">
        <label>장세</label>
        <div class="regime-btns">
          <button type="button" class="regime-btn" onclick="setPlanRegime('up',this)">상승장</button>
          <button type="button" class="regime-btn" onclick="setPlanRegime('box',this)">박스장</button>
          <button type="button" class="regime-btn" onclick="setPlanRegime('down',this)">하락장</button>
        </div>
        <div class="row2" style="margin-top:10px;">
          <div>
            <label>종목명</label>
            <input type="text" id="p-name" placeholder="삼성전자">
          </div>
```

(이 블록 뒤에 이어지는 "주문 날짜" 등 나머지 필드는 그대로 둔다 — 첫 `row2` 여는 태그와 "종목명" label/input만 옮겨졌을 뿐, 그 다음 줄(`<label>주문 날짜</label>` 등)은 수정하지 않는다.)

- [ ] **Step 2: `planRegime` 상태 변수 + `setPlanRegime()` 함수 추가**

다음을 찾아(Task 2에서 추가한 줄):

```js
  const REGIME_LABEL = { up: '상승장', box: '박스장', down: '하락장' };
```

아래로 교체(새 변수만 추가, `REGIME_LABEL` 줄 자체는 안 건드림):

```js
  const REGIME_LABEL = { up: '상승장', box: '박스장', down: '하락장' };
  let planRegime = null;     // 계획 추가 폼에서 선택한 장세
```

그 다음, `renderPlans()` 함수 바로 앞(Task 2에서 추가한 `parsePlanDate`/`tradingDaysSince` 위 또는 아래 어디든 무방, 함수 선언이므로 위치 상관없음)에 다음 함수를 추가:

```js
  function setPlanRegime(val, btn) {
    planRegime = val;
    document.querySelectorAll('#subtab-add .regime-btn').forEach(b => b.classList.remove('active', 'r-up', 'r-box', 'r-down'));
    btn.classList.add('active', 'r-' + val);
  }
```

- [ ] **Step 3: `addPlan()` — 날짜 저장 형식 + regime 검증/저장 + 리셋**

다음을 찾아:

```js
  function addPlan() {
    const name   = document.getElementById('p-name').value.trim();
    const code   = document.getElementById('p-code').value.trim();
    const dateRaw = document.getElementById('p-date').value;
    const date   = dateRaw ? new Date(dateRaw).toLocaleDateString('ko-KR') : new Date().toLocaleDateString('ko-KR');
    const b1     = parseFloat(document.getElementById('p-buy1').value) || 0;
    const q1     = parseFloat(document.getElementById('p-qty1').value) || 0;
    const b2     = parseFloat(document.getElementById('p-buy2').value) || 0;
    const q2     = parseFloat(document.getElementById('p-qty2').value) || 0;
    const custSL = parseFloat(document.getElementById('p-custom-sl').value) || 0;

    if (!name || !b1 || !q1) { showToast('종목명, 1차 매수가, 수량 필수'); return; }

    const plan = { id: Date.now(), date, name, code, b1, q1, b2: b2||null, q2: q2||null, custSL: custSL||null, sells: [] };
    plans.unshift(plan);
    renderPlans();
    ['p-name','p-code','p-buy1','p-qty1','p-buy2','p-qty2','p-custom-sl'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
```

아래로 교체:

```js
  function addPlan() {
    const name   = document.getElementById('p-name').value.trim();
    const code   = document.getElementById('p-code').value.trim();
    const dateRaw = document.getElementById('p-date').value;
    const date   = dateRaw || new Date().toISOString().split('T')[0];
    const b1     = parseFloat(document.getElementById('p-buy1').value) || 0;
    const q1     = parseFloat(document.getElementById('p-qty1').value) || 0;
    const b2     = parseFloat(document.getElementById('p-buy2').value) || 0;
    const q2     = parseFloat(document.getElementById('p-qty2').value) || 0;
    const custSL = parseFloat(document.getElementById('p-custom-sl').value) || 0;

    if (!name || !b1 || !q1) { showToast('종목명, 1차 매수가, 수량 필수'); return; }
    if (!planRegime) { showToast('장세(상승장/박스장/하락장)를 선택하세요'); return; }

    const plan = { id: Date.now(), date, name, code, b1, q1, b2: b2||null, q2: q2||null, custSL: custSL||null, sells: [], regime: planRegime };
    plans.unshift(plan);
    renderPlans();
    ['p-name','p-code','p-buy1','p-qty1','p-buy2','p-qty2','p-custom-sl'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
    planRegime = null;
    document.querySelectorAll('#subtab-add .regime-btn').forEach(b => b.classList.remove('active','r-up','r-box','r-down'));
```

(이 함수의 나머지 줄들 — `fetch(APPS_SCRIPT_URL, ...)`, `switchSubTab('wait')`, `showToast(...)` — 은 그대로 둔다.)

- [ ] **Step 4: 브라우저에서 확인**

1. 계획 탭 → "+ 추가" → 장세를 안 고르고 종목명/1차매수가/수량만 입력 후 "+ 목록에 추가" → "장세(상승장/박스장/하락장)를 선택하세요" 토스트, 추가 안 됨 확인.
2. "박스장" 버튼 클릭 → 주황색으로 활성화되는지 확인. 종목명/1차매수가/수량 입력 후 추가 → 정상 추가되고, 장세 버튼 선택이 초기화(비활성)되는지 확인.
3. 콘솔에서 `plans[0].regime` → `'box'`, `plans[0].date` → `"2026-06-26"` 형식(ISO)인지 확인.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: add regime selector to plan add form, store plan.date as ISO"
```

---

### Task 4: `renderPlans()` — 주문일/D+n/장세 배지 표시

**Files:**
- Modify: `jb-journal/index.html:512-566` (`renderPlans`)

**Interfaces:**
- Consumes: Task 2의 `tradingDaysSince()`, `REGIME_LABEL`. Task 3이 저장하는 `p.regime`, `p.date`(ISO).

- [ ] **Step 1: 카드 템플릿의 이름/코드 줄 교체**

다음을 찾아:

```js
      return `
        <div class="pc">
          <button class="pc-del" onclick="deletePlan(${p.id})">✕</button>
          <div class="pc-name">${p.name}</div>
          <div class="pc-code">${p.code || p.date}</div>
          <div class="pc-row"><span class="pc-lbl">1차</span><span class="pc-val">${p.b1.toLocaleString('ko-KR')}</span></div>
```

아래로 교체:

```js
      const dn = tradingDaysSince(p.date);
      const warnNow = dn !== null && dn >= 3;
      const orderLine = dn !== null
        ? `<div class="pc-order-date${warnNow ? ' warn' : ''}">주문 ${p.date} · D+${dn}${warnNow ? ' ⚠️' : ''}</div>`
        : `<div class="pc-order-date">주문 ${p.date}</div>`;
      const regimeBadge = p.regime ? `<span class="pc-regime r-${p.regime}">${REGIME_LABEL[p.regime]}</span>` : '';

      return `
        <div class="pc">
          <button class="pc-del" onclick="deletePlan(${p.id})">✕</button>
          <div class="pc-name">${p.name}</div>
          <div class="pc-code">${p.code || ''}</div>
          ${regimeBadge}
          ${orderLine}
          <div class="pc-row"><span class="pc-lbl">1차</span><span class="pc-val">${p.b1.toLocaleString('ko-KR')}</span></div>
```

- [ ] **Step 2: 브라우저에서 확인**

대기목록 카드에서:
- Task 3에서 새로 추가한 종목: 장세 배지(예: 🟧박스장 색) + "주문 2026-06-26 · D+0" 표시(평소 색).
- 기존 7건(테스, 피에스케이 등, `regime` 없음): 장세 배지 없이 날짜 줄만 표시, 에러 없이 렌더링되는지 확인. 날짜가 `"2026. 6. 9."` 같은 옛 형식인데도 D+n이 정상 계산되는지 확인(예: 테스 6/9 주문 → 오늘이 6/26이면 평일만 세어 D+13 정도, 정확한 숫자보다 "에러 없이 숫자가 나오는지"가 핵심).
- D+3 이상인 카드는 빨간 글씨 + ⚠️로 강조되는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: show order-date/D+n and regime badge on plan cards"
```

---

### Task 5: Apps Script `Code.gs` — `Plans` 시트에 `regime` 컬럼 추가 (+ 수동 재배포) + `initPlans()` 읽기

**Files:**
- Modify: `jb-journal/apps-script/Code.gs` (전체)
- Modify: `jb-journal/index.html:460-480` (`initPlans`)

**Interfaces:**
- Produces: `Plans` 시트 12번째 컬럼 = `regime`. `initPlans()`가 `plans[i].regime`을 채움.

- [ ] **Step 1: `Code.gs`의 `plan-save` 핸들러 수정**

다음을 찾아:

```js
  if (data.type === 'plan-save') {
    let sheet = ss.getSheetByName('Plans');
    if (!sheet) sheet = ss.insertSheet('Plans');
    const p = data.plan;
    sheet.appendRow([
      p.id, p.date, p.name, p.code,
      p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
      JSON.stringify(p.sells || []),
      p.use2 === undefined ? '' : p.use2
    ]);
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
```

아래로 교체:

```js
  if (data.type === 'plan-save') {
    let sheet = ss.getSheetByName('Plans');
    if (!sheet) sheet = ss.insertSheet('Plans');
    const p = data.plan;
    sheet.appendRow([
      p.id, p.date, p.name, p.code,
      p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
      JSON.stringify(p.sells || []),
      p.use2 === undefined ? '' : p.use2,
      p.regime || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
```

- [ ] **Step 2: `plan-update` 핸들러 수정**

다음을 찾아:

```js
  if (data.type === 'plan-update') {
    let sheet = ss.getSheetByName('Plans');
    if (!sheet) return ContentService.createTextOutput('OK');
    const p = data.plan;
    const values = sheet.getDataRange().getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(p.id)) {
        sheet.getRange(i + 1, 1, 1, 11).setValues([[
          p.id, p.date, p.name, p.code,
          p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
          JSON.stringify(p.sells || []),
          p.use2 === undefined ? '' : p.use2
        ]]);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
```

아래로 교체:

```js
  if (data.type === 'plan-update') {
    let sheet = ss.getSheetByName('Plans');
    if (!sheet) return ContentService.createTextOutput('OK');
    const p = data.plan;
    const values = sheet.getDataRange().getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(p.id)) {
        sheet.getRange(i + 1, 1, 1, 12).setValues([[
          p.id, p.date, p.name, p.code,
          p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
          JSON.stringify(p.sells || []),
          p.use2 === undefined ? '' : p.use2,
          p.regime || ''
        ]]);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
```

- [ ] **Step 3: 커밋 (Code.gs는 버전관리용, 실제 반영은 Step 4에서 수동으로)**

```bash
git add apps-script/Code.gs
git commit -m "feat: add regime column to Plans sheet save/update"
```

- [ ] **Step 4: ⚠️ 사용자가 직접 수행 — Apps Script 수동 재배포**

이 단계는 에이전트가 대신할 수 없음(구글 계정 인증 필요). 사용자에게 다음을 안내하고 완료될 때까지 기다린다:

1. 구글 시트(`SHEETS_URL`) 열기 → 확장 프로그램 → Apps Script
2. 에디터의 `Code.gs` 내용을 방금 git에 커밋한 새 내용으로 교체(복사/붙여넣기) → 저장(Ctrl+S)
3. 우측 상단 "배포" → "배포 관리" → 기존 배포 옆 연필(✏️) 아이콘 → 버전: "새 버전" 선택 → "배포"
4. 배포 URL이 `index.html`의 `APPS_SCRIPT_URL`과 동일한지 확인(보통 동일하게 유지됨 — 바뀌면 알려달라고 요청)

- [ ] **Step 5: `initPlans()` — `regime` 읽기**

다음을 찾아:

```js
        plans = rows.filter(r => r[0]).map(r => ({
          id: Number(r[0]), date: r[1], name: r[2], code: r[3],
          b1: Number(r[4]), q1: Number(r[5]),
          b2: r[6] ? Number(r[6]) : null, q2: r[7] ? Number(r[7]) : null,
          custSL: r[8] ? Number(r[8]) : null,
          sells: r[9] ? JSON.parse(r[9]) : [],
          use2: r[10] === true || r[10] === 'true' ? true : (r[10] === false || r[10] === 'false' ? false : undefined)
        }));
```

아래로 교체:

```js
        plans = rows.filter(r => r[0]).map(r => ({
          id: Number(r[0]), date: r[1], name: r[2], code: r[3],
          b1: Number(r[4]), q1: Number(r[5]),
          b2: r[6] ? Number(r[6]) : null, q2: r[7] ? Number(r[7]) : null,
          custSL: r[8] ? Number(r[8]) : null,
          sells: r[9] ? JSON.parse(r[9]) : [],
          use2: r[10] === true || r[10] === 'true' ? true : (r[10] === false || r[10] === 'false' ? false : undefined),
          regime: r[11] || null
        }));
```

- [ ] **Step 6: 브라우저에서 확인**

Task 3에서 추가한 테스트 종목(장세 선택했던 것)을 한 번 더 추가 → 페이지 새로고침(F5) → 대기목록에서 장세 배지가 그대로 살아있는지 확인(새로고침 전엔 메모리 상태였지만, 이제 Sheets 라운드트립을 거쳐도 유지되어야 함). 기존 7건은 `regime: null`로 읽혀서 에러 없이 표시되는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add index.html
git commit -m "feat: read regime back from Plans sheet in initPlans"
```

---

### Task 6: `finalizePlan()` — `regime`을 매매내역 + Sheets row로 전달

**Files:**
- Modify: `jb-journal/index.html:700-745` (`finalizePlan`)

**Interfaces:**
- Consumes: Task 2의 `REGIME_LABEL`, Task 3의 `plan.regime`.
- Produces: `hist` 항목에 `regime` 필드 추가. Sheets row의 0-indexed 25번째 칸(기존 `''`)에 장세 라벨.

- [ ] **Step 1: `hist` 객체와 `row` 배열 수정**

다음을 찾아:

```js
    const hist = loadHistory();
    hist.unshift({
      id: Date.now(), date: plan.sells[plan.sells.length - 1].date,
      name: plan.name, code: plan.code, status,
      // avg is the full nominal blended cost basis across q1+q2 (display-only);
      // it is NOT the per-phase basis actually used to compute profit/rate above,
      // which is split via plan.b1 (phase 1) and phaseInfo(plan,true).base (phase 2).
      avg: Math.round(avg), sells: plan.sells, totalQty, profit, rate,
      tax: totalTax, use2: plan.use2 === true
    });
    saveHistory(hist);

    const sellDateCol  = plan.sells.map(s => s.date).join(' / ');
    const sellPriceCol = plan.sells.map(s => `${s.price}(${s.qty}주)`).join(' / ');
    const memoCol = plan.sells.filter(s => s.memo).map(s => `${s.date}: ${s.memo}`).join(' / ');
    const b2 = use2 ? plan.b2 : 0, q2 = use2 ? plan.q2 : 0;
    const row = [
      plan.date, plan.name, plan.code,
      plan.b1, plan.q1, plan.b1*plan.q1, Math.round(plan.b1*1.03),
      b2||'', q2||'', b2&&q2 ? b2*q2 : '',
      Math.round(avg), totalAmt, Math.round(avg*0.93),
      Math.round(avg*1.03), Math.round(avg*1.05), Math.round(avg*1.07),
      Math.round(totalAmt*0.07),
      sellDateCol, sellPriceCol, profit, rate,
      totalTax, status, memoCol, '', '', '', '', '', '', ''
    ];
```

아래로 교체:

```js
    const hist = loadHistory();
    hist.unshift({
      id: Date.now(), date: plan.sells[plan.sells.length - 1].date,
      name: plan.name, code: plan.code, status,
      // avg is the full nominal blended cost basis across q1+q2 (display-only);
      // it is NOT the per-phase basis actually used to compute profit/rate above,
      // which is split via plan.b1 (phase 1) and phaseInfo(plan,true).base (phase 2).
      avg: Math.round(avg), sells: plan.sells, totalQty, profit, rate,
      tax: totalTax, use2: plan.use2 === true, regime: plan.regime || null
    });
    saveHistory(hist);

    const sellDateCol  = plan.sells.map(s => s.date).join(' / ');
    const sellPriceCol = plan.sells.map(s => `${s.price}(${s.qty}주)`).join(' / ');
    const memoCol = plan.sells.filter(s => s.memo).map(s => `${s.date}: ${s.memo}`).join(' / ');
    const b2 = use2 ? plan.b2 : 0, q2 = use2 ? plan.q2 : 0;
    const row = [
      plan.date, plan.name, plan.code,
      plan.b1, plan.q1, plan.b1*plan.q1, Math.round(plan.b1*1.03),
      b2||'', q2||'', b2&&q2 ? b2*q2 : '',
      Math.round(avg), totalAmt, Math.round(avg*0.93),
      Math.round(avg*1.03), Math.round(avg*1.05), Math.round(avg*1.07),
      Math.round(totalAmt*0.07),
      sellDateCol, sellPriceCol, profit, rate,
      totalTax, status, memoCol, '', REGIME_LABEL[plan.regime] || '', '', '', '', ''
    ];
```

핵심 변경점: `row` 배열은 여전히 31개 요소(인덱스 0~30) — 인덱스 24는 그대로 `''`(기존 불일치 칸, 손대지 않음), 인덱스 25만 `''`→`REGIME_LABEL[plan.regime] || ''`로 바뀐다. 인덱스 26~30은 여전히 빈 문자열 5개.

- [ ] **Step 2: 배열 길이 재확인 (코드 리딩만)**

```
0:date 1:name 2:code 3:b1 4:q1 5:b1*q1 6:t1@b1
7:b2 8:q2 9:b2*q2 10:avg 11:totalAmt 12:sl
13:t1@avg 14:t2@avg 15:t3@avg 16:maxloss
17:sellDateCol 18:sellPriceCol 19:profit 20:rate 21:totalTax 22:status
23:memoCol 24:'' 25:regimeLabel 26:'' 27:'' 28:'' 29:'' 30:''
```

총 31개(인덱스 0~30), 변경 전과 길이 동일한지 확인.

- [ ] **Step 3: 브라우저에서 확인**

Task 3~5에서 만든 테스트 plan(장세="박스장")을 결과 입력 모달에서 전량 매도 처리해서 finalize시킨다. "내역" 탭에서 정상적으로 표시되는지 확인(이번 작업으론 화면에 장세를 보여주는 UI는 안 만들었으므로, 콘솔에서 확인):

```js
console.log(JSON.parse(localStorage.getItem('jb-history'))[0].regime); // Expected: 'box'
```

구글 시트(메인 내역 탭)에서 새로 추가된 행의 26번째 칸(Z열)에 "박스장"이 들어갔는지 직접 확인.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: propagate plan.regime to history and sheets row"
```

---

### Task 7: "입력" 탭 — 장세 선택 추가 (수동 백필 폼)

**Files:**
- Modify: `jb-journal/index.html:239-246` (케이스 버튼 섹션 다음)
- Modify: `jb-journal/index.html:797-838` (`saveTrade`, `resetForm`)

**Interfaces:**
- Consumes: Task 2의 `REGIME_LABEL`.
- Produces: 전역 상태 `entryRegime`, `function setEntryRegime(val, btn)`. `saveTrade()`의 row 0-indexed 25번째 칸에 장세 라벨.

- [ ] **Step 1: "입력" 탭 HTML에 장세 버튼 추가**

다음을 찾아:

```html
    <div class="section">
      <div class="section-title">케이스</div>
      <div class="case-btns">
        <button class="case-btn active" onclick="setCase(1,this)">케이스1<br><small style="font-weight:400;font-size:11px">1차만</small></button>
        <button class="case-btn" onclick="setCase(2,this)">케이스2<br><small style="font-weight:400;font-size:11px">1+2차</small></button>
        <button class="case-btn" onclick="setCase(3,this)">케이스3<br><small style="font-weight:400;font-size:11px">손절</small></button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">종목 정보</div>
```

아래로 교체:

```html
    <div class="section">
      <div class="section-title">케이스</div>
      <div class="case-btns">
        <button class="case-btn active" onclick="setCase(1,this)">케이스1<br><small style="font-weight:400;font-size:11px">1차만</small></button>
        <button class="case-btn" onclick="setCase(2,this)">케이스2<br><small style="font-weight:400;font-size:11px">1+2차</small></button>
        <button class="case-btn" onclick="setCase(3,this)">케이스3<br><small style="font-weight:400;font-size:11px">손절</small></button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">장세</div>
      <div class="regime-btns">
        <button type="button" class="regime-btn" onclick="setEntryRegime('up',this)">상승장</button>
        <button type="button" class="regime-btn" onclick="setEntryRegime('box',this)">박스장</button>
        <button type="button" class="regime-btn" onclick="setEntryRegime('down',this)">하락장</button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">종목 정보</div>
```

- [ ] **Step 2: `setEntryRegime()` 함수 추가**

Task 3에서 추가한 `setPlanRegime()` 바로 아래에 추가:

```js
  function setEntryRegime(val, btn) {
    entryRegime = val;
    document.querySelectorAll('#tab-entry .regime-btn').forEach(b => b.classList.remove('active', 'r-up', 'r-box', 'r-down'));
    btn.classList.add('active', 'r-' + val);
  }
```

다음을 찾아(Task 3에서 추가한 줄):

```js
  let planRegime = null;     // 계획 추가 폼에서 선택한 장세
```

아래로 교체(새 변수만 추가):

```js
  let planRegime = null;     // 계획 추가 폼에서 선택한 장세
  let entryRegime = null;    // "입력" 탭에서 선택한 장세
```

- [ ] **Step 3: `saveTrade()` — 검증 + row 반영**

다음을 찾아:

```js
  function saveTrade() {
    const b1 = n('buy1Price'), q1 = n('buy1Qty');
    const b2 = n('buy2Price'), q2 = n('buy2Qty');
    const sell = n('sellPrice');
    const use2 = currentCase !== 1 && b2 > 0 && q2 > 0;
    if (!b1 || !q1) { showToast('1차 매수가와 수량을 입력하세요.'); return; }
```

아래로 교체:

```js
  function saveTrade() {
    const b1 = n('buy1Price'), q1 = n('buy1Qty');
    const b2 = n('buy2Price'), q2 = n('buy2Qty');
    const sell = n('sellPrice');
    const use2 = currentCase !== 1 && b2 > 0 && q2 > 0;
    if (!b1 || !q1) { showToast('1차 매수가와 수량을 입력하세요.'); return; }
    if (!entryRegime) { showToast('장세(상승장/박스장/하락장)를 선택하세요'); return; }
```

다음을 찾아:

```js
      '', document.getElementById('tradeStatus').value,
      '케이스'+currentCase, getReasons(),
      '','','','', document.getElementById('memo').value
    ];
```

아래로 교체:

```js
      '', document.getElementById('tradeStatus').value,
      '케이스'+currentCase, getReasons(),
      REGIME_LABEL[entryRegime] || '', '', '', '', document.getElementById('memo').value
    ];
```

- [ ] **Step 4: `resetForm()` — 장세 리셋 추가**

다음을 찾아:

```js
  function resetForm() {
    ['stockName','stockCode','buyDate','buy1Price','buy1Qty','buy2Price','buy2Qty','sellPrice','sellDate','memo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('tradeStatus').value='보유중';
    document.querySelectorAll('#reason-pills .pill.active').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.case-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
    currentCase=1; document.getElementById('section-buy2').classList.add('hidden'); calcAll();
  }
```

아래로 교체:

```js
  function resetForm() {
    ['stockName','stockCode','buyDate','buy1Price','buy1Qty','buy2Price','buy2Qty','sellPrice','sellDate','memo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('tradeStatus').value='보유중';
    document.querySelectorAll('#reason-pills .pill.active').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.case-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
    currentCase=1; document.getElementById('section-buy2').classList.add('hidden'); calcAll();
    entryRegime = null;
    document.querySelectorAll('#tab-entry .regime-btn').forEach(b=>b.classList.remove('active','r-up','r-box','r-down'));
  }
```

- [ ] **Step 5: 브라우저에서 확인**

1. "입력" 탭 → 장세 선택 없이 1차매수가/수량만 입력 후 "저장하기" → "장세(상승장/박스장/하락장)를 선택하세요" 토스트, 저장 안 됨(네트워크 탭에서 fetch 안 나가는지도 확인).
2. "상승장" 선택(초록 활성화 확인) → 나머지 필수값 입력 후 저장 → "✅ 저장 완료!" 토스트, 폼이 리셋되면서 장세 버튼도 비활성화로 돌아오는지 확인.
3. 구글 시트(메인 내역) 새 행의 26번째 칸(Z열)에 "상승장"이 들어갔는지 확인 — Task 6에서 확인한 "박스장" 행과 같은 컬럼(Z열)에 위치해야 함(컬럼 일치 검증).

- [ ] **Step 6: 커밋**

```bash
git add index.html
git commit -m "feat: add regime selector to manual entry tab"
```

---

### Task 8: 전체 End-to-End 확인 + 회귀 확인

**Files:** 없음(검증만, 문제 발견 시에만 수정 후 커밋)

- [ ] **Step 1: 시나리오 A — 계획 → 완료 전체 흐름**

1. 계획 탭 "+ 추가": 장세 "상승장", 종목명 "테스트A", 1차 10000원×10주, 주문날짜는 오늘.
2. 대기목록에서 카드 확인: 🟢상승장 배지, "주문 YYYY-MM-DD · D+0" 표시(경고 없음).
3. 결과 입력 모달 열어서 10주 전량 10500원에 매도 → finalize.
4. "내역" 탭에서 콘솔로 `JSON.parse(localStorage.getItem('jb-history'))[0].regime === 'up'` 확인.
5. 구글 시트 메인 내역 탭에서 새 행 Z열 = "상승장" 확인.

- [ ] **Step 2: 시나리오 B — 기존(레거시) 대기 plan 회귀 확인**

대기목록의 기존 7건(테스, 피에스케이, 원익IPS, 브이엠, 한울반도체, JW신약, SK) 전부 에러 없이 카드로 렌더링되는지 확인(장세 배지 없음, 날짜만 표시 — D+n 계산은 되거나 최소 에러 없이 날짜 원문 표시).

- [ ] **Step 3: 시나리오 C — D+3 경고 확인**

콘솔에서 임시로 plan 하나의 날짜를 4거래일 전으로 바꿔서(`plans[0].date = '2026-06-20'` 같은 식, 실제 환경의 "4거래일 전" 날짜로) `renderPlans()`를 호출 → 해당 카드가 빨간색 + ⚠️로 표시되는지 확인. 확인 후 페이지 새로고침해서 임시 변경 되돌리기(저장 안 했으므로 새로고침하면 원상복구).

- [ ] **Step 4: 시나리오 D — "입력" 탭 회귀 확인**

장세 선택 추가 이전부터 있던 케이스 버튼/매수정보/매도정보/상태/매수이유/메모 입력이 전부 평소대로 동작하는지(특히 `calcAll()` 자동계산) 확인.

- [ ] **Step 5: Apps Script 재배포 최종 확인**

Task 5 Step 4의 수동 재배포가 완료되었는지 사용자에게 재확인. 안 됐다면 `plan-update`(부분 매도 저장)가 12번째 컬럼 없이 11개만 덮어써서 `regime` 컬럼이 사라질 수 있음 — 재배포 전까지는 계획 탭에서 "부분 매도" 저장을 하지 않도록 사용자에게 안내.

- [ ] **Step 6: 최종 커밋(필요 시)**

검증 중 문제를 발견해서 수정했다면:

```bash
git add -A
git commit -m "fix: address issues found in order-date/regime E2E verification"
```

문제 없었다면 커밋 없이 종료.
