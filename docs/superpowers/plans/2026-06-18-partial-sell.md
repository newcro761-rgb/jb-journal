# 분할매도(차수별 매도가/매도일) 결과 입력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "계획" 탭의 결과 입력 모달에서 매도를 1~3차로 나눠 입력(매도가/수량/매도일 각각)할 수 있게 하고, 잔량이 남으면 계획 목록에 계속 대기시킨다.

**Architecture:** 순수 HTML/CSS/JS 단일 파일(`index.html`) 수정 + Plans 시트를 다루는 Apps Script(`apps-script/Code.gs`, 리포지토리에 신규 추가, 배포는 사용자가 script.google.com에 수동 복사)를 확장. 이 프로젝트엔 빌드/테스트 도구가 없으므로(기존 2026-06-17 plan과 동일 패턴), 각 태스크의 검증은 **브라우저에서 직접 동작 확인** 또는 **curl로 Apps Script 엔드포인트 직접 호출**로 한다.

**Tech Stack:** Vanilla HTML5/CSS3/JS, Google Apps Script Web App, localStorage, GitHub Pages.

## Global Constraints

- 변경 범위는 "계획" 탭의 결과 입력 모달 + 관련 데이터 흐름(Plans 시트, 매매내역 localStorage, 30열 Sheets row export)에만 한정한다. "입력" 탭의 수동 거래입력 폼은 건드리지 않는다.
- `APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec'` (현재 `index.html` 4번째 줄, 변경하지 않음).
- 기존 Plans 시트 행(컬럼 9개: id~custSL)과 호환되어야 한다 — 새 컬럼(`sellsJson`, `use2`)이 빈칸이어도 정상 동작.
- 분할매도 수량은 차수마다 사용자가 직접 입력한다(자동 분배 없음). 최대 3행.
- 설계 문서: `docs/superpowers/specs/2026-06-18-partial-sell-design.md` (이 plan의 모든 계산식/조건은 이 문서를 따른다).

---

### Task 1: Apps Script 백엔드 — Plans 스키마 확장 (sellsJson, use2) + plan-update

**Files:**
- Create: `jb-journal/apps-script/Code.gs`

**Interfaces:**
- Produces: Apps Script Web App가 받는 POST 타입에 `plan-update` 추가(`{type:'plan-update', plan}`). `doGet`은 Plans 시트의 모든 행을 11개 컬럼(`id,date,name,code,b1,q1,b2,q2,custSL,sellsJson,use2`)으로 반환.

- [ ] **Step 1: `apps-script/Code.gs` 작성**

`jb-journal/apps-script/Code.gs` 전체 내용:

```js
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Plans');
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const values = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify(values)).setMimeType(ContentService.MimeType.JSON);
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
      p.use2 === undefined ? '' : p.use2
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

  // 거래 저장 (기존 — 30열 row, 변경 없음)
  const sheet = ss.getActiveSheet();
  sheet.appendRow(data.row);
  return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: git에 커밋**

```bash
cd /c/Users/June/jb-journal
git add apps-script/Code.gs
git commit -m "feat: extend Apps Script Plans backend with sells/use2 + plan-update"
```

- [ ] **Step 3: 사용자에게 배포 안내 (수동 작업 — 사용자가 직접 수행)**

다음 내용을 사용자에게 그대로 전달:

1. script.google.com → JB저널용 프로젝트(또는 Google Sheets에서 확장 프로그램 → Apps Script) 열기
2. 기존 코드를 전체 선택(에디터 안 클릭 → Ctrl+A) 후 삭제
3. 방금 만든 `jb-journal/apps-script/Code.gs` 내용을 그대로 붙여넣기
4. **배포 → 배포 관리(Manage deployments) → 연필(Edit) 아이콘 → 버전: 새 버전(New version) → 배포**
   - ⚠️ "새 배포(New deployment)"를 누르면 URL이 바뀌어서 `index.html`이 더 이상 작동하지 않는다. 반드시 기존 배포를 "수정"해서 새 버전으로 올려야 한다.
5. 완료되면 알려달라고 요청

- [ ] **Step 4: 배포 확인 (사용자가 4단계를 완료한 후 실행)**

```bash
curl -s "https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec"
```

Expected: JSON 2차원 배열(`[[...], [...]]`) 또는 `[]`. HTML 로그인 페이지나 에러 문자열이 나오면 배포가 잘못된 것이므로 Step 3을 다시 확인.

- [ ] **Step 5: plan-save / plan-update / plan-delete 라운드트립 확인**

```bash
URL="https://script.google.com/macros/s/AKfycbyPh528maVN8U-F31wTOgqWC6mVTKtIXKuppPgqY98wIBEkHGgUJvoGgUJsmgMp_qzISg/exec"

# 1) 테스트 plan 저장
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"type":"plan-save","plan":{"id":999999999,"date":"2026-06-18","name":"TEST_DELETE_ME","code":"000000","b1":10000,"q1":100,"b2":null,"q2":null,"custSL":null,"sells":[]}}' \
  "$URL"

# 2) 조회해서 sellsJson(빈 배열), use2(빈칸) 컬럼까지 11개 들어있는지 확인
curl -s "$URL" | grep -o "TEST_DELETE_ME"

# 3) plan-update로 부분매도 반영 확인
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"type":"plan-update","plan":{"id":999999999,"date":"2026-06-18","name":"TEST_DELETE_ME","code":"000000","b1":10000,"q1":100,"b2":null,"q2":null,"custSL":null,"sells":[{"qty":50,"price":10500,"date":"2026-06-18"}],"use2":false}}' \
  "$URL"
curl -s "$URL" | grep -o '"qty":50'

# 4) 정리 — 테스트 행 삭제
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"type":"plan-delete","id":999999999}' \
  "$URL"
curl -s "$URL" | grep -c "TEST_DELETE_ME"
```

Expected: 2)에서 `TEST_DELETE_ME` 출력, 3)에서 `"qty":50` 출력, 4)의 마지막 grep -c 결과는 `0`(삭제됨 확인).

---

### Task 2: 프론트엔드 데이터 모델 — plan에 `sells`/`use2` 추가

**Files:**
- Modify: `jb-journal/index.html:458-476` (`initPlans`)
- Modify: `jb-journal/index.html:491` (`addPlan`)

**Interfaces:**
- Produces: `plans` 배열의 각 항목이 `sells: [{qty,price,date}]`, `use2: true|false|undefined` 필드를 갖는다. 이후 모든 Task가 이 필드를 사용.

- [ ] **Step 1: `initPlans()`의 row 매핑에 sells/use2 추가**

`jb-journal/index.html`에서 다음을 찾아:

```js
        plans = rows.filter(r => r[0]).map(r => ({
          id: Number(r[0]), date: r[1], name: r[2], code: r[3],
          b1: Number(r[4]), q1: Number(r[5]),
          b2: r[6] ? Number(r[6]) : null, q2: r[7] ? Number(r[7]) : null,
          custSL: r[8] ? Number(r[8]) : null
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
          use2: r[10] === true || r[10] === 'true' ? true : (r[10] === false || r[10] === 'false' ? false : undefined)
        }));
```

- [ ] **Step 2: `addPlan()`의 plan 객체에 `sells: []` 추가**

다음을 찾아:

```js
    const plan = { id: Date.now(), date, name, code, b1, q1, b2: b2||null, q2: q2||null, custSL: custSL||null };
```

아래로 교체:

```js
    const plan = { id: Date.now(), date, name, code, b1, q1, b2: b2||null, q2: q2||null, custSL: custSL||null, sells: [] };
```

- [ ] **Step 3: 브라우저 콘솔에서 확인**

`index.html`을 브라우저에서 열고 개발자 콘솔에서:

```js
console.log(plans[0]);
```

Expected: 출력된 객체에 `sells: []` (또는 기존에 저장된 배열), `use2` 키가 존재.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: add sells/use2 fields to plan data model"
```

---

### Task 3: 결과 입력 모달 — 결과 버튼 제거, 차수별 매도 입력 + 2차 체결 토글

**Files:**
- Modify: `jb-journal/index.html:128-141` (모달 관련 CSS)
- Modify: `jb-journal/index.html:359-378` (모달 HTML)
- Modify: `jb-journal/index.html:404-407` (상태 변수)
- Modify: `jb-journal/index.html:558-582` (`openModal`, `closeModal`, `selectResult` 제거)

**Interfaces:**
- Consumes: Task 2의 `plan.sells`, `plan.use2`
- Produces: 전역 변수 `modalUse2`(boolean). DOM: `#sell-rows`에 `.sell-row` 0~3개, 각 row는 `.sr-price`/`.sr-qty`/`.sr-date` input을 가짐. `addSellRow()`, `removeSellRow(btn)`, `toggleUse2()` 함수 — Task 4의 `saveResult()`가 이 DOM 구조와 `modalUse2`를 그대로 읽음.

- [ ] **Step 1: CSS 교체 — 결과 버튼 스타일 제거, 매도 행/토글 스타일 추가**

다음을 찾아:

```css
    .result-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
    .result-btn { padding: 10px; border: 2px solid var(--border); background: var(--input-bg); color: var(--muted); border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: center; }
    .result-btn.active-green { border-color: var(--green); color: var(--green); background: rgba(46,213,115,0.1); }
    .result-btn.active-red   { border-color: var(--red);   color: var(--red);   background: rgba(255,71,87,0.1); }
    .modal-actions { display: flex; gap: 8px; margin-top: 14px; }
    .modal-cancel { flex: 1; padding: 14px; background: var(--input-bg); border: 1px solid var(--border); color: var(--muted); border-radius: 10px; font-size: 15px; cursor: pointer; }
    .modal-save { flex: 2; padding: 14px; background: var(--accent); border: none; color: white; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
```

아래로 교체:

```css
    .sell-row { background: var(--input-bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px; margin-bottom: 8px; }
    .sr-del { padding: 8px 10px; background: none; border: 1px solid var(--border); color: var(--muted); border-radius: 8px; font-size: 12px; cursor: pointer; }
    .add-row-btn { width: 100%; padding: 10px; margin-bottom: 14px; background: none; border: 1px dashed var(--border); color: var(--blue); border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .toggle-btn { width: 44px; height: 26px; border-radius: 13px; border: none; background: var(--border); position: relative; cursor: pointer; transition: background 0.15s; }
    .toggle-btn::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: white; transition: left 0.15s; }
    .toggle-btn.on { background: var(--green); }
    .toggle-btn.on::after { left: 21px; }
    .modal-actions { display: flex; gap: 8px; margin-top: 14px; }
    .modal-cancel { flex: 1; padding: 14px; background: var(--input-bg); border: 1px solid var(--border); color: var(--muted); border-radius: 10px; font-size: 15px; cursor: pointer; }
    .modal-save { flex: 2; padding: 14px; background: var(--accent); border: none; color: white; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
```

- [ ] **Step 2: 모달 HTML 교체**

다음을 찾아:

```html
<!-- 결과 입력 모달 -->
<div class="modal-overlay" id="result-modal">
  <div class="modal-box">
    <div class="modal-title" id="modal-stock-name">종목명</div>
    <div class="modal-sub" id="modal-stock-info">1차 매수가</div>
    <div class="result-btns">
      <button class="result-btn" onclick="selectResult('수익(1차만)')">✅ 1차 익절</button>
      <button class="result-btn" onclick="selectResult('수익(2차까지)')">✅ 2차 익절</button>
      <button class="result-btn" onclick="selectResult('손절(1차만)')">❌ 1차 손절</button>
      <button class="result-btn" onclick="selectResult('손절(2차까지)')">❌ 2차 손절</button>
    </div>
    <label>실제 매도가</label>
    <input type="number" id="modal-sell-price" placeholder="매도가 입력">
    <label style="margin-top:10px;">매도일</label>
    <input type="date" id="modal-sell-date">
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeModal()">취소</button>
      <button class="modal-save" onclick="saveResult()">저장하기</button>
    </div>
  </div>
</div>
```

아래로 교체:

```html
<!-- 결과 입력 모달 -->
<div class="modal-overlay" id="result-modal">
  <div class="modal-box">
    <div class="modal-title" id="modal-stock-name">종목명</div>
    <div class="modal-sub" id="modal-stock-info">1차 매수가</div>
    <div class="modal-sub" id="modal-holdings-info"></div>
    <div class="hidden" id="modal-use2-row" style="margin:10px 0;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:13px;color:var(--text);">2차 매수 실제 체결</span>
      <button type="button" class="toggle-btn" id="modal-use2-toggle" onclick="toggleUse2()"></button>
    </div>
    <div id="sell-rows"></div>
    <button type="button" class="add-row-btn" id="add-sell-row-btn" onclick="addSellRow()">+ 매도 추가</button>
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeModal()">취소</button>
      <button class="modal-save" onclick="saveResult()">저장하기</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 상태 변수 교체**

다음을 찾아:

```js
  let currentCase = 1;
  let p2manual = false;      // 2차 매수가 수동 입력 여부
  let modalPlanId = null;    // 현재 모달에 열린 plan id
  let modalResultStatus = null;
```

아래로 교체:

```js
  let currentCase = 1;
  let p2manual = false;      // 2차 매수가 수동 입력 여부
  let modalPlanId = null;    // 현재 모달에 열린 plan id
  let modalUse2 = true;      // 모달에서 2차 매수 실제 체결 여부 토글 상태
```

- [ ] **Step 4: `openModal`/`closeModal`/`selectResult` 교체**

다음을 찾아:

```js
  /* ── 결과 입력 모달 ── */
  function openModal(id) {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    modalPlanId = id;
    modalResultStatus = null;
    document.getElementById('modal-stock-name').textContent = plan.name + (plan.code ? ` (${plan.code})` : '');
    document.getElementById('modal-stock-info').textContent = `1차 ${w(plan.b1)} × ${plan.q1}주` + (plan.b2 ? ` · 2차 ${w(plan.b2)} × ${plan.q2}주` : '');
    document.getElementById('modal-sell-price').value = '';
    document.getElementById('modal-sell-date').value = new Date().toISOString().split('T')[0];
    document.querySelectorAll('.result-btn').forEach(b => b.className = 'result-btn');
    document.getElementById('result-modal').classList.add('show');
  }

  function closeModal() {
    document.getElementById('result-modal').classList.remove('show');
    modalPlanId = null;
  }

  function selectResult(status) {
    modalResultStatus = status;
    document.querySelectorAll('.result-btn').forEach(b => b.className = 'result-btn');
    const map = { '수익(1차만)': 0, '수익(2차까지)': 1, '손절(1차만)': 2, '손절(2차까지)': 3 };
    const btn = document.querySelectorAll('.result-btn')[map[status]];
    btn.className = 'result-btn ' + (status.startsWith('수익') ? 'active-green' : 'active-red');
  }
```

아래로 교체:

```js
  /* ── 결과 입력 모달 ── */
  function openModal(id) {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    modalPlanId = id;
    if (!plan.sells) plan.sells = [];

    const hasB2 = !!(plan.b2 && plan.q2);
    modalUse2 = plan.use2 !== undefined ? plan.use2 : true;

    document.getElementById('modal-stock-name').textContent = plan.name + (plan.code ? ` (${plan.code})` : '');
    document.getElementById('modal-stock-info').textContent = `1차 ${w(plan.b1)} × ${plan.q1}주` + (plan.b2 ? ` · 2차 ${w(plan.b2)} × ${plan.q2}주` : '');

    const use2Row = document.getElementById('modal-use2-row');
    use2Row.classList.toggle('hidden', !hasB2 || plan.sells.length > 0);
    document.getElementById('modal-use2-toggle').classList.toggle('on', modalUse2);

    updateHoldingsInfo(plan);

    document.getElementById('sell-rows').innerHTML = '';
    addSellRow();

    document.getElementById('result-modal').classList.add('show');
  }

  function updateHoldingsInfo(plan) {
    const hasB2 = !!(plan.b2 && plan.q2);
    const totalQty = (hasB2 && modalUse2) ? plan.q1 + plan.q2 : plan.q1;
    const soldQty = plan.sells.reduce((s, x) => s + x.qty, 0);
    document.getElementById('modal-holdings-info').textContent = `총 ${totalQty}주 · 매도완료 ${soldQty}주 · 남음 ${totalQty - soldQty}주`;
  }

  function toggleUse2() {
    modalUse2 = !modalUse2;
    document.getElementById('modal-use2-toggle').classList.toggle('on', modalUse2);
    const plan = plans.find(p => p.id === modalPlanId);
    if (plan) updateHoldingsInfo(plan);
  }

  function addSellRow() {
    const wrap = document.getElementById('sell-rows');
    if (wrap.querySelectorAll('.sell-row').length >= 3) return;
    const div = document.createElement('div');
    div.className = 'sell-row';
    div.innerHTML = `
      <div class="row2">
        <div><label>매도가</label><input type="number" class="sr-price" placeholder="10300"></div>
        <div><label>수량</label><input type="number" class="sr-qty" placeholder="50"></div>
      </div>
      <div class="row2" style="margin-top:8px;align-items:end;">
        <div><label>매도일</label><input type="date" class="sr-date" value="${new Date().toISOString().split('T')[0]}"></div>
        <div style="display:flex;justify-content:flex-end;"><button type="button" class="sr-del" onclick="removeSellRow(this)">✕ 삭제</button></div>
      </div>`;
    wrap.appendChild(div);
  }

  function removeSellRow(btn) {
    const wrap = document.getElementById('sell-rows');
    if (wrap.querySelectorAll('.sell-row').length <= 1) return;
    btn.closest('.sell-row').remove();
  }

  function closeModal() {
    document.getElementById('result-modal').classList.remove('show');
    modalPlanId = null;
  }
```

- [ ] **Step 5: 브라우저에서 모달 UI 확인**

브라우저에서 `index.html` 열기 → "계획" 탭 → 대기 목록에 종목이 있으면 "결과 입력" 클릭 (없으면 임시로 종목 하나 추가 후 클릭).

확인 항목:
- 모달 상단에 "총 OOO주 · 매도완료 0주 · 남음 OOO주" 표시됨
- 2차 매수가/수량이 있는 종목이면 "2차 매수 실제 체결" 토글이 보이고, 클릭 시 ON/OFF 전환되며 "남음" 수량이 즉시 바뀜
- 매도 입력 행이 1개 기본으로 보이고, "+ 매도 추가" 클릭 시 최대 3개까지 늘어남, "✕ 삭제"로 줄어듬(1개 미만으로는 안 줄어듬)
- ✅/❌ 결과 버튼이 더 이상 보이지 않음

- [ ] **Step 6: 커밋**

```bash
git add index.html
git commit -m "feat: replace result buttons with multi-row sell input + use2 toggle"
```

---

### Task 4: `saveResult()` — 검증, 부분/전량 매도 분기, Sheets/History 저장

**Files:**
- Modify: `jb-journal/index.html:584-622` (`saveResult`)

**Interfaces:**
- Consumes: Task 3의 `#sell-rows .sell-row`, `modalUse2`; Task 2의 `plan.sells`/`plan.use2`; 기존 `deletePlan(id)`, `loadHistory()`/`saveHistory()`, `w()`, `showToast()`.
- Produces: `finalizePlan(plan, totalQty)` 함수(전량 매도 완료 시 history 저장 + Sheets POST + plan 삭제).

- [ ] **Step 1: `saveResult()` 전체 교체**

다음을 찾아:

```js
  function saveResult() {
    if (!modalPlanId || !modalResultStatus) { showToast('케이스를 선택하세요.'); return; }
    const sell = parseFloat(document.getElementById('modal-sell-price').value) || 0;
    const sellDate = document.getElementById('modal-sell-date').value;
    if (!sell) { showToast('매도가를 입력하세요.'); return; }

    const plan = plans.find(p => p.id === modalPlanId);
    if (!plan) return;

    const use2 = modalResultStatus.includes('2차') && plan.b2 && plan.q2;
    const b2 = use2 ? plan.b2 : 0, q2 = use2 ? plan.q2 : 0;
    const avg = use2 ? (plan.b1*plan.q1 + b2*q2)/(plan.q1+q2) : plan.b1;
    const totalQty = use2 ? plan.q1+q2 : plan.q1;
    const totalAmt = plan.b1*plan.q1 + (use2 ? b2*q2 : 0);
    const profit = Math.round((sell - avg) * totalQty);
    const rate = ((sell - avg) / avg).toFixed(4);

    // 히스토리 저장
    const hist = loadHistory();
    hist.unshift({ id: Date.now(), date: sellDate, name: plan.name, code: plan.code, status: modalResultStatus, avg: Math.round(avg), sell, totalQty, profit, rate: parseFloat(rate) });
    saveHistory(hist);

    // Sheets POST
    const row = [
      plan.date, plan.name, plan.code,
      plan.b1, plan.q1, plan.b1*plan.q1, Math.round(plan.b1*1.03),
      b2||'', q2||'', b2&&q2 ? b2*q2 : '',
      Math.round(avg), totalAmt, Math.round(avg*0.93),
      Math.round(avg*1.03), Math.round(avg*1.05), Math.round(avg*1.07),
      Math.round(totalAmt*0.07),
      sellDate, sell, profit, rate,
      '', modalResultStatus, '', '', '', '', '', '', '', ''
    ];
    fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ row }) });

    deletePlan(modalPlanId);
    closeModal();
    showToast('✅ 저장 완료!');
  }
```

아래로 교체:

```js
  function saveResult() {
    const plan = plans.find(p => p.id === modalPlanId);
    if (!plan) return;

    const rows = Array.from(document.querySelectorAll('#sell-rows .sell-row')).map(row => ({
      price: parseFloat(row.querySelector('.sr-price').value) || 0,
      qty: parseFloat(row.querySelector('.sr-qty').value) || 0,
      date: row.querySelector('.sr-date').value
    })).filter(r => r.price > 0 && r.qty > 0 && r.date);

    if (!rows.length) { showToast('매도가/수량/매도일을 입력하세요.'); return; }

    const hasB2 = !!(plan.b2 && plan.q2);
    const totalQty = (hasB2 && modalUse2) ? plan.q1 + plan.q2 : plan.q1;
    const prevSoldQty = plan.sells.reduce((s, x) => s + x.qty, 0);
    const remainQty = totalQty - prevSoldQty;
    const newQty = rows.reduce((s, x) => s + x.qty, 0);

    if (newQty > remainQty) { showToast(`남은 수량(${remainQty}주)보다 많습니다.`); return; }

    plan.sells = plan.sells.concat(rows);
    if (plan.use2 === undefined) plan.use2 = modalUse2;

    if (newQty === remainQty) {
      finalizePlan(plan, totalQty);
      closeModal();
      showToast('✅ 저장 완료!');
    } else {
      fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'plan-update', plan }) });
      renderPlans();
      closeModal();
      showToast('✅ 부분 매도 저장됨. 잔량은 계획에 남아있습니다.');
    }
  }

  function finalizePlan(plan, totalQty) {
    const use2 = plan.use2 && plan.b2 && plan.q2;
    const avg = use2 ? (plan.b1*plan.q1 + plan.b2*plan.q2)/(plan.q1+plan.q2) : plan.b1;
    const totalAmt = plan.b1*plan.q1 + (use2 ? plan.b2*plan.q2 : 0);
    const soldAmt = plan.sells.reduce((s, x) => s + x.price*x.qty, 0);
    const profit = Math.round(soldAmt - avg*totalQty);
    const rate = parseFloat(((soldAmt/totalQty - avg) / avg).toFixed(4));
    const status = (profit >= 0 ? '수익' : '손절') + `(${plan.sells.length}차분할)`;

    const hist = loadHistory();
    hist.unshift({
      id: Date.now(), date: plan.sells[plan.sells.length - 1].date,
      name: plan.name, code: plan.code, status,
      avg: Math.round(avg), sells: plan.sells, totalQty, profit, rate
    });
    saveHistory(hist);

    const sellDateCol  = plan.sells.map(s => s.date).join(' / ');
    const sellPriceCol = plan.sells.map(s => `${s.price}(${s.qty}주)`).join(' / ');
    const b2 = use2 ? plan.b2 : 0, q2 = use2 ? plan.q2 : 0;
    const row = [
      plan.date, plan.name, plan.code,
      plan.b1, plan.q1, plan.b1*plan.q1, Math.round(plan.b1*1.03),
      b2||'', q2||'', b2&&q2 ? b2*q2 : '',
      Math.round(avg), totalAmt, Math.round(avg*0.93),
      Math.round(avg*1.03), Math.round(avg*1.05), Math.round(avg*1.07),
      Math.round(totalAmt*0.07),
      sellDateCol, sellPriceCol, profit, rate,
      '', status, '', '', '', '', '', '', '', ''
    ];
    fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ row }) });

    deletePlan(plan.id);
  }
```

- [ ] **Step 2: 브라우저에서 부분 매도 시나리오 확인**

대기 목록에 1차 매수가 10000원 × 100주 (2차 없음)인 종목으로 결과 입력 모달 열기:

1. 매도 행 1개에 매도가 10300, 수량 40, 오늘 날짜 입력 → 저장
   - Expected: 토스트 "✅ 부분 매도 저장됨...", 모달 닫힘, 종목은 대기 목록에 그대로 남음
2. 같은 종목 "결과 입력" 다시 열기
   - Expected: "총 100주 · 매도완료 40주 · 남음 60주" 표시
3. 매도 행에 매도가 10500, 수량 60 입력 → 저장
   - Expected: 토스트 "✅ 저장 완료!", 종목이 대기 목록에서 사라짐
4. "내역" 탭으로 이동
   - Expected: 새 항목에 수익금 `(10300-10000)*40 + (10500-10000)*60 = 12000+30000 = 42000`원 표시, `hist-meta`에 "2건 분할매도" 표시 (Task 6 완료 후 표시됨 — 지금은 안 보여도 정상, Task 6에서 확인)

- [ ] **Step 3: 남은 수량 초과 입력 시 에러 확인**

아무 종목이나 결과 입력 모달 열고, 수량을 보유 수량보다 크게 입력 후 저장 → "남은 수량(...주)보다 많습니다." 토스트가 뜨고 저장되지 않는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: multi-tranche saveResult with partial-sell support"
```

---

### Task 5: 계획 카드 — 매도 진행 표시

**Files:**
- Modify: `jb-journal/index.html:120-125` (`.pc-divider` 근처 CSS)
- Modify: `jb-journal/index.html:508-555` (`renderPlans`)

**Interfaces:**
- Consumes: Task 2의 `plan.sells`

- [ ] **Step 1: CSS 추가**

다음을 찾아:

```css
    .pc-divider { border: none; border-top: 1px solid var(--border); margin: 5px 0; }
```

아래로 교체:

```css
    .pc-divider { border: none; border-top: 1px solid var(--border); margin: 5px 0; }
    .pc-progress { margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--border); font-size: 10px; color: var(--blue); }
```

- [ ] **Step 2: `renderPlans()`에 진행 표시 삽입**

다음을 찾아:

```js
      return `
        <div class="pc">
          <button class="pc-del" onclick="deletePlan(${p.id})">✕</button>
          <div class="pc-name">${p.name}</div>
          <div class="pc-code">${p.code || p.date}</div>
          <div class="pc-row"><span class="pc-lbl">1차</span><span class="pc-val">${p.b1.toLocaleString('ko-KR')}</span></div>
          <div class="pc-row"><span class="pc-lbl">손절</span><span class="pc-val red">${sl1.toLocaleString('ko-KR')}</span></div>
          ${sl1Ref}
          <div class="pc-row"><span class="pc-lbl">+3%</span><span class="pc-val green">${t1.toLocaleString('ko-KR')}</span></div>
          <div class="pc-row"><span class="pc-lbl">+5%</span><span class="pc-val green">${t2.toLocaleString('ko-KR')}</span></div>
          <div class="pc-row"><span class="pc-lbl">+7%</span><span class="pc-val green">${t3.toLocaleString('ko-KR')}</span></div>
          ${sec2}
          <button class="pc-result-btn" onclick="openModal(${p.id})">결과 입력</button>
        </div>`;
```

아래로 교체:

```js
      const sells = p.sells || [];
      const soldQty = sells.reduce((s, x) => s + x.qty, 0);
      const progress = sells.length
        ? `<div class="pc-progress">매도진행: ${soldQty}주 · 평균 ${Math.round(sells.reduce((s,x)=>s+x.price*x.qty,0)/soldQty).toLocaleString('ko-KR')}원</div>`
        : '';

      return `
        <div class="pc">
          <button class="pc-del" onclick="deletePlan(${p.id})">✕</button>
          <div class="pc-name">${p.name}</div>
          <div class="pc-code">${p.code || p.date}</div>
          <div class="pc-row"><span class="pc-lbl">1차</span><span class="pc-val">${p.b1.toLocaleString('ko-KR')}</span></div>
          <div class="pc-row"><span class="pc-lbl">손절</span><span class="pc-val red">${sl1.toLocaleString('ko-KR')}</span></div>
          ${sl1Ref}
          <div class="pc-row"><span class="pc-lbl">+3%</span><span class="pc-val green">${t1.toLocaleString('ko-KR')}</span></div>
          <div class="pc-row"><span class="pc-lbl">+5%</span><span class="pc-val green">${t2.toLocaleString('ko-KR')}</span></div>
          <div class="pc-row"><span class="pc-lbl">+7%</span><span class="pc-val green">${t3.toLocaleString('ko-KR')}</span></div>
          ${sec2}
          ${progress}
          <button class="pc-result-btn" onclick="openModal(${p.id})">결과 입력</button>
        </div>`;
```

- [ ] **Step 3: 브라우저에서 확인**

Task 4 Step 2의 1번 시나리오(40주만 부분 매도)를 다시 한 뒤, 대기 목록 카드에 "매도진행: 40주 · 평균 10,300원"이 표시되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: show sell progress on waiting plan cards"
```

---

### Task 6: 매매내역 — 분할매도 표시

**Files:**
- Modify: `jb-journal/index.html:744-755` (`renderHistory`의 `list.innerHTML`)

**Interfaces:**
- Consumes: Task 4가 저장하는 `hist` 항목의 `sells` 배열(레거시 항목은 `sells`가 없을 수 있음 — `undefined` 안전 처리 필요)

- [ ] **Step 1: `hist-meta` 라인에 분할매도 표시 추가**

다음을 찾아:

```js
    list.innerHTML = hist.map(h => `
      <div class="hist-item">
        <div class="hist-left">
          <div class="hist-name">${h.name}${h.code?` <span style="font-size:11px;color:var(--muted);">${h.code}</span>`:''}</div>
          <div class="hist-meta">${h.date} · ${h.status}</div>
        </div>
```

아래로 교체:

```js
    list.innerHTML = hist.map(h => `
      <div class="hist-item">
        <div class="hist-left">
          <div class="hist-name">${h.name}${h.code?` <span style="font-size:11px;color:var(--muted);">${h.code}</span>`:''}</div>
          <div class="hist-meta">${h.date} · ${h.status}${h.sells && h.sells.length > 1 ? ` · ${h.sells.length}건 분할매도` : ''}</div>
        </div>
```

- [ ] **Step 2: 브라우저에서 확인**

"내역" 탭 열기 → Task 4에서 만든 항목(40주+60주 분할매도)의 `hist-meta`에 "2건 분할매도"가 붙어 표시되는지 확인. 기존에 단일 매도로 저장된 레거시 항목(있다면)은 에러 없이 그대로 표시되는지 확인(콘솔에 에러 없어야 함).

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: show partial-sell count in trade history list"
```

---

### Task 7: 전체 End-to-End 확인 + 최종 커밋

**Files:** 없음(검증만)

- [ ] **Step 1: 시나리오 A — 1차만 보유, 1번에 전량 매도**

계획 탭에서 종목 추가(2차 없음, 1차 100주) → 결과 입력 → 매도 행 1개에 전량 100주 입력 → 저장. 대기 목록에서 사라지고 내역에 1건 생기는지 확인.

- [ ] **Step 2: 시나리오 B — 2차까지 매수, 2차 체결 토글 OFF로 1차만 평단 계산**

2차 매수가/수량이 있는 종목 추가 → 결과 입력 모달에서 "2차 매수 실제 체결" 토글을 OFF로 바꿈 → "총 N주"가 q1만으로 계산되는지 확인(q1+q2가 아님) → 매도 입력 후 저장 → 내역에서 평단가가 1차 매수가와 같은지 확인.

- [ ] **Step 3: 시나리오 C — 3차 분할매도**

종목 추가 → 결과 입력 모달에서 "+ 매도 추가"로 3행까지 늘려서 3차(예: 30/30/40주)로 나눠 입력, 각각 다른 날짜 지정 → 저장(3행 합 = 총수량이어야 finalize됨) → 내역에 "3건 분할매도", Sheets로 보내는 row의 매도일/매도가 칸이 `/`로 구분된 텍스트인지(개발자도구 Network 탭에서 POST body 확인).

- [ ] **Step 4: 회귀 확인 — "입력" 탭은 영향 없음**

"입력" 탭에서 기존 수동 거래입력 폼(실제매도가 1칸)이 그대로 동작하는지 확인(매도가 입력 시 수익금/수익률 계산, 저장 버튼 동작).

- [ ] **Step 5: 최종 커밋(필요 시)**

위 확인 과정에서 수정한 내용이 있다면:

```bash
git add -A
git commit -m "fix: address issues found in partial-sell E2E verification"
```

없다면 이 Task는 커밋 없이 종료.
