# 승/패 주관 판단 + 매매내역 요약 그리드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계획 탭 결과입력 모달에서 매도 저장 시 "승"/"패"를 직접 선택하게 하고, 승률 통계가 이 판단을 우선 반영하게 하며, 매매내역 탭 상단에 최근 9건을 3×3 그리드로 요약 표시한다.

**Architecture:** `index.html` 단일 파일 변경만으로 구현한다. 승/패는 결과입력 모달에서 `resultVerdict`(모듈 상태)로 선택되고, 저장 시 `plan.verdict`에 옮겨졌다가 `finalizePlan()`에서 `hist.verdict`와 Sheets row로 전파된다. 승률 통계와 새 요약 그리드는 둘 다 `renderHistory()`에서 `h.verdict`가 있으면 그걸, 없으면 기존처럼 수익금 부호로 판단하는 동일한 폴백 규칙을 쓴다. Google Sheets 컬럼 추가나 `Code.gs` 변경은 없다(기존에 비어있는 26번째 칸 재사용).

**Tech Stack:** Vanilla HTML5/CSS3/JS, localStorage, Google Apps Script Web App(변경 없음), GitHub Pages.

## Global Constraints

- 승/패 선택은 **계획 탭 결과입력 모달에서만** 추가한다 — "입력" 탭, 매매내역 "수정" 모달에는 추가하지 않는다(설계 문서 Non-Goals, 사용자 확정).
- 승/패는 결과입력 모달에서 "저장하기"를 누를 때마다(부분매도 포함) 필수다 — 다른 필수 선택 항목(장세)과 동일한 패턴으로, 선택 안 하면 토스트로 막는다. 부분매도가 여러 번 있으면 `plan.verdict`는 매번 최신 선택값으로 덮어써지고, 최종적으로 `finalizePlan()`이 쓸 때의 값이 기록된다.
- 승률 계산과 요약 그리드의 색상 판정은 항상 같은 폴백 규칙을 쓴다: `h.verdict ? h.verdict === 'win' : h.profit >= 0`(승률은 `> 0`이 아니라 `profit >= 0` 동치로 통일 — 기존 `status` 계산의 `profit >= 0 ? '수익' : '손절'`과 일치시킴).
- Google Sheets 컬럼 개수/위치는 바꾸지 않는다. `finalizePlan()`의 31열 row 중 진짜로 비어있는 26번째 칸(0-indexed)에 `'승'`/`'패'` 텍스트를 쓴다. `Code.gs` 수정·재배포는 없다.
- 요약 그리드 셀은 클릭/탭해도 동작이 없다 — 표시만 한다(사용자 확정).
- 기존 "최근 거래" 세로 리스트는 구조를 바꾸지 않는다 — 여전히 전체 내역을 보여준다.
- 설계 문서: `docs/superpowers/specs/2026-06-26-verdict-summary-grid-design.md`.

---

### Task 1: 결과입력 모달 — 승/패 버튼 UI

**Files:**
- Modify: `jb-journal/index.html:176` (CSS, `.regime-btn.active.r-down` 규칙 바로 뒤에 추가)
- Modify: `jb-journal/index.html:414-415` (결과입력 모달 마크업, "+ 매도 추가"와 `modal-actions` 사이)
- Modify: `jb-journal/index.html:464-468` (상태 선언부, `VERDICT_LABEL`/`resultVerdict` 추가)
- Modify: `jb-journal/index.html:690-712` (`openModal()`, 모달 열 때 승/패 상태 초기화/복원)

**Interfaces:**
- Produces: `const VERDICT_LABEL = { win: '승', lose: '패' }`, `let resultVerdict`, `function setVerdict(val, btn)`.
- Consumes: 없음(이 태스크는 UI와 상태만 다룬다).
- Task 2가 `resultVerdict`(검증용)와 `VERDICT_LABEL`(Sheets row 작성용)을 읽는다.

- [ ] **Step 1: CSS 추가**

다음을 찾아:

```css
    .regime-btn.active.r-down { border-color: var(--red);    color: var(--red);    background: rgba(255,71,87,0.1); }
```

아래로 교체:

```css
    .regime-btn.active.r-down { border-color: var(--red);    color: var(--red);    background: rgba(255,71,87,0.1); }
    .verdict-btns { display: flex; gap: 8px; margin-top: 10px; }
    .verdict-btn {
      flex: 1; padding: 10px 4px; border: 2px solid var(--border); background: var(--input-bg);
      color: var(--muted); border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; text-align: center;
    }
    .verdict-btn.active.v-win  { border-color: var(--green); color: var(--green); background: rgba(46,213,115,0.1); }
    .verdict-btn.active.v-lose { border-color: var(--red);   color: var(--red);   background: rgba(255,71,87,0.1); }
```

- [ ] **Step 2: 모달 마크업에 승/패 버튼 추가**

다음을 찾아:

```html
    <button type="button" class="add-row-btn" id="add-sell-row-btn" onclick="addSellRow()">+ 매도 추가</button>
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeModal()">취소</button>
      <button class="modal-save" onclick="saveResult()">저장하기</button>
    </div>
  </div>
</div>

<!-- 매매내역 수정 모달 -->
```

아래로 교체:

```html
    <button type="button" class="add-row-btn" id="add-sell-row-btn" onclick="addSellRow()">+ 매도 추가</button>
    <div class="verdict-btns">
      <button type="button" class="verdict-btn" data-verdict="win" onclick="setVerdict('win',this)">승</button>
      <button type="button" class="verdict-btn" data-verdict="lose" onclick="setVerdict('lose',this)">패</button>
    </div>
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeModal()">취소</button>
      <button class="modal-save" onclick="saveResult()">저장하기</button>
    </div>
  </div>
</div>

<!-- 매매내역 수정 모달 -->
```

(주의: 이 find 블록은 `result-modal`의 `modal-actions`와 그 뒤의 `edit-modal` 주석을 함께 포함시켜 유일하게 매칭되게 한 것이다 — `edit-modal`에도 동일한 `modal-actions` 텍스트가 있어서 그 둘만으로는 중복 매칭될 수 있다. `data-verdict` 속성은 Step 5에서 `openModal()`이 버튼을 선택할 때 쓴다.)

- [ ] **Step 3: 상태 변수 추가**

다음을 찾아:

```js
  let editHistId = null;     // 현재 매매내역 수정 모달에 열린 history id
```

아래로 교체:

```js
  let editHistId = null;     // 현재 매매내역 수정 모달에 열린 history id
  const VERDICT_LABEL = { win: '승', lose: '패' };
  let resultVerdict = null;  // 결과입력 모달에서 선택한 승/패
```

- [ ] **Step 4: `setVerdict()` 함수 추가**

다음을 찾아:

```js
  function openModal(id) {
```

위에 삽입(이 줄은 그대로 두고 바로 위에 추가):

```js
  function setVerdict(val, btn) {
    resultVerdict = val;
    document.querySelectorAll('#result-modal .verdict-btn').forEach(b => b.classList.remove('active', 'v-win', 'v-lose'));
    btn.classList.add('active', 'v-' + val);
  }

  function openModal(id) {
```

- [ ] **Step 5: `openModal()`에서 모달을 열 때마다 승/패 버튼 상태를 초기화/복원**

다음을 찾아:

```js
    document.getElementById('sell-rows').innerHTML = '';
    addSellRow();

    document.getElementById('result-modal').classList.add('show');
  }
```

아래로 교체:

```js
    document.getElementById('sell-rows').innerHTML = '';
    addSellRow();

    resultVerdict = plan.verdict || null;
    document.querySelectorAll('#result-modal .verdict-btn').forEach(b => {
      b.classList.remove('active', 'v-win', 'v-lose');
    });
    if (resultVerdict) {
      const vbtn = document.querySelector(`#result-modal .verdict-btn[data-verdict="${resultVerdict}"]`);
      if (vbtn) vbtn.classList.add('active', 'v-' + resultVerdict);
    }

    document.getElementById('result-modal').classList.add('show');
  }
```

- [ ] **Step 6: 브라우저에서 확인**

`index.html`을 브라우저에서 열고, "계획" 탭에서 임의 종목을 추가한 뒤(1차매수가 10000, 수량 10, 장세 선택) 카드의 "결과 입력"을 클릭. 모달에 "승"/"패" 버튼이 보이는지, 클릭하면 활성 스타일(승=초록, 패=빨강)이 토글되는지 확인. "취소"로 모달을 닫고 다시 "결과 입력"을 누르면 승/패 버튼이 다시 비활성 상태로 보이는지(아직 `plan.verdict`가 없으므로) 확인.

Expected: 승/패 버튼 클릭 시 시각적 활성화, 모달 재오픈 시 선택 안 된 상태(아직 저장된 verdict 없음)로 초기화.

- [ ] **Step 7: 커밋**

```bash
git add index.html
git commit -m "feat: add win/loss verdict buttons to result-entry modal"
```

---

### Task 2: 승/패 검증 + 저장 시 전파

**Files:**
- Modify: `jb-journal/index.html:889-897` (`saveResult()`, 검증 + `plan.verdict` 저장)
- Modify: `jb-journal/index.html:934-959` (`finalizePlan()`, `hist` 객체와 Sheets row에 verdict 반영)

**Interfaces:**
- Consumes: Task 1의 `resultVerdict`, `VERDICT_LABEL`.
- Produces: `plan.verdict`(`'win'|'lose'`), `hist.verdict`(`'win'|'lose'|null`) — Task 3가 `h.verdict`를 읡는다.

- [ ] **Step 1: `saveResult()`에 승/패 필수 검증 + `plan.verdict` 저장 추가**

다음을 찾아:

```js
    if (!rows.length) { showToast('매도가/수량/매도일을 입력하세요.'); return; }

    const remainQty = info.pool - info.sold;
    const newQty = rows.reduce((s, x) => s + x.qty, 0);

    if (newQty > remainQty) { showToast(`남은 수량(${remainQty}주)보다 많습니다.`); return; }

    plan.sells = plan.sells.concat(rows);
    if (modalUse2 === true) plan.use2 = true;
```

아래로 교체:

```js
    if (!rows.length) { showToast('매도가/수량/매도일을 입력하세요.'); return; }
    if (!resultVerdict) { showToast('승/패를 선택하세요'); return; }

    const remainQty = info.pool - info.sold;
    const newQty = rows.reduce((s, x) => s + x.qty, 0);

    if (newQty > remainQty) { showToast(`남은 수량(${remainQty}주)보다 많습니다.`); return; }

    plan.sells = plan.sells.concat(rows);
    plan.verdict = resultVerdict;
    if (modalUse2 === true) plan.use2 = true;
```

- [ ] **Step 2: `finalizePlan()`에서 `hist.verdict`와 Sheets row에 반영**

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
      tax: totalTax, use2: plan.use2 === true, regime: plan.regime || null
    });
    saveHistory(hist);

    const sellDateCol  = plan.sells.map(s => s.date).join(' / ');
    const sellPriceCol = plan.sells.map(s => `${s.price}(${s.qty}주)[${s.tag}]`).join(' / ');
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
      totalTax, status, memoCol, '', REGIME_LABEL[plan.regime] || '', '', '', '', '', ''
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
      tax: totalTax, use2: plan.use2 === true, regime: plan.regime || null,
      verdict: plan.verdict || null
    });
    saveHistory(hist);

    const sellDateCol  = plan.sells.map(s => s.date).join(' / ');
    const sellPriceCol = plan.sells.map(s => `${s.price}(${s.qty}주)[${s.tag}]`).join(' / ');
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
      totalTax, status, memoCol, '', REGIME_LABEL[plan.regime] || '', VERDICT_LABEL[plan.verdict] || '', '', '', '', ''
    ];
```

- [ ] **Step 3: 브라우저에서 전체 흐름 확인**

`index.html`을 브라우저에서 열고, "계획" 탭에서 종목 추가(1차매수가 10000, 수량 10) → "결과 입력" → 매도가 10700, 수량 10, 매도일 입력 → **승/패를 고르지 않고** "저장하기" 클릭 → "승/패를 선택하세요" 토스트가 뜨고 저장이 안 되는지 확인. 이번엔 "승"을 선택하고 다시 "저장하기" → "✅ 저장 완료!" 토스트 확인. 개발자 도구 콘솔에서:

```js
JSON.parse(localStorage.getItem('jb-history'))[0].verdict
```

를 실행해 `"win"`이 나오는지 확인. 확인 후 콘솔에서 정리:

```js
const h = JSON.parse(localStorage.getItem('jb-history')).slice(1);
localStorage.setItem('jb-history', JSON.stringify(h));
```

Expected: 승/패 미선택 시 저장 막힘, "승" 선택 후 저장하면 `hist[0].verdict === 'win'`.

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: validate and propagate win/loss verdict through saveResult/finalizePlan"
```

---

### Task 3: 매매내역 표시 — 승률 폴백 + 최근 9건 요약 그리드

**Files:**
- Modify: `jb-journal/index.html:147` (CSS, `.stat-grid` 규칙 바로 뒤에 `.summary-grid`/`.summary-cell` 추가)
- Modify: `jb-journal/index.html:379-384` (탭3 HTML, `stat-grid`와 "최근 거래" 사이에 요약 그리드 섹션 추가)
- Modify: `jb-journal/index.html:1081-1100` (`renderHistory()`, 승률 계산 폴백 + 요약 그리드 렌더링)

**Interfaces:**
- Consumes: Task 2가 만든 `h.verdict`(`'win'|'lose'|null`).

- [ ] **Step 1: CSS 추가**

다음을 찾아:

```css
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
```

아래로 교체:

```css
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .summary-cell { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 6px; text-align: center; }
    .summary-cell .sc-name { font-size: 11px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .summary-cell .sc-rate { font-size: 13px; font-weight: 700; margin-top: 4px; }
    .summary-cell .sc-rate.green { color: var(--green); }
    .summary-cell .sc-rate.red   { color: var(--red); }
```

- [ ] **Step 2: 탭3 HTML에 요약 그리드 섹션 추가**

다음을 찾아:

```html
    <div class="stat-grid" id="stat-grid"></div>

    <div class="section" style="padding:10px 14px;">
      <div class="section-title">최근 거래</div>
      <div id="hist-list"></div>
    </div>
```

아래로 교체:

```html
    <div class="stat-grid" id="stat-grid"></div>

    <div class="section" style="padding:10px 14px;">
      <div class="section-title">최근 9건 요약</div>
      <div class="summary-grid" id="summary-grid"></div>
    </div>

    <div class="section" style="padding:10px 14px;">
      <div class="section-title">최근 거래</div>
      <div id="hist-list"></div>
    </div>
```

- [ ] **Step 3: `renderHistory()` — 빈 상태에서 요약 그리드도 비우기**

다음을 찾아:

```js
    if (!hist.length) {
      grid.innerHTML = '';
      list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px 0;">아직 기록이 없습니다.</div>';
      return;
    }
```

아래로 교체:

```js
    if (!hist.length) {
      grid.innerHTML = '';
      document.getElementById('summary-grid').innerHTML = '';
      list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px 0;">아직 기록이 없습니다.</div>';
      return;
    }
```

- [ ] **Step 4: 승률 계산에 폴백 적용**

다음을 찾아:

```js
    const total = hist.reduce((s,h)=>s+h.profit, 0);
    const wins  = hist.filter(h=>h.profit>0).length;
    const rate  = (wins/hist.length*100).toFixed(0);
```

아래로 교체:

```js
    const total = hist.reduce((s,h)=>s+h.profit, 0);
    const wins  = hist.filter(h => h.verdict ? h.verdict === 'win' : h.profit >= 0).length;
    const rate  = (wins/hist.length*100).toFixed(0);
```

- [ ] **Step 5: 요약 그리드 렌더링 추가**

다음을 찾아:

```js
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-label">총 수익금</div><div class="stat-val ${total>=0?'green':'red'}">${total>=0?'+':''}${total.toLocaleString('ko-KR')}원</div></div>
      <div class="stat-card"><div class="stat-label">승률</div><div class="stat-val ${wins/hist.length>=0.5?'green':'red'}">${rate}%</div></div>
      <div class="stat-card"><div class="stat-label">거래 수</div><div class="stat-val">${hist.length}건</div></div>
      <div class="stat-card"><div class="stat-label">${rateLabel}</div><div class="stat-val ${rateVal>=0?'green':'red'}">${rateVal>=0?'+':''}${rateVal}%</div></div>`;

    list.innerHTML = hist.map(h => {
```

아래로 교체:

```js
    grid.innerHTML = `
      <div class="stat-card"><div class="stat-label">총 수익금</div><div class="stat-val ${total>=0?'green':'red'}">${total>=0?'+':''}${total.toLocaleString('ko-KR')}원</div></div>
      <div class="stat-card"><div class="stat-label">승률</div><div class="stat-val ${wins/hist.length>=0.5?'green':'red'}">${rate}%</div></div>
      <div class="stat-card"><div class="stat-label">거래 수</div><div class="stat-val">${hist.length}건</div></div>
      <div class="stat-card"><div class="stat-label">${rateLabel}</div><div class="stat-val ${rateVal>=0?'green':'red'}">${rateVal>=0?'+':''}${rateVal}%</div></div>`;

    document.getElementById('summary-grid').innerHTML = hist.slice(0, 9).map(h => {
      const isWin = h.verdict ? h.verdict === 'win' : h.profit >= 0;
      const rateClass = isWin ? 'green' : 'red';
      const sRate = (h.rate * 100).toFixed(2);
      return `
      <div class="summary-cell">
        <div class="sc-name">${h.name}</div>
        <div class="sc-rate ${rateClass}">${sRate>=0?'+':''}${sRate}%</div>
      </div>`;
    }).join('');

    list.innerHTML = hist.map(h => {
```

- [ ] **Step 6: 브라우저에서 확인**

`index.html`을 브라우저에서 열고 개발자 도구 콘솔에서 verdict가 있는 거래와 없는 거래를 섞어서 주입:

```js
const h = [];
h.push({id: 1, date: '2026-06-01', name: '승거래', code: '', status: '수익(1차분할) · 최고 +7%', avg: 10000, sells: [{price: 10700, qty: 10, date: '2026-06-01', tax: 0, phase: 1, memo: '', tag: '+7%'}], totalQty: 10, profit: 7000, rate: 0.07, tax: 0, use2: false, regime: null, verdict: 'lose'});
h.push({id: 2, date: '2026-06-02', name: '레거시거래', code: '', status: '손절(1차분할) · 최고 손절', avg: 10000, sells: [{price: 9300, qty: 10, date: '2026-06-02', tax: 0, phase: 1, memo: '', tag: '손절'}], totalQty: 10, profit: -7000, rate: -0.07, tax: 0, use2: false, regime: null});
localStorage.setItem('jb-history', JSON.stringify(h));
```

페이지를 새로고침하고 "매매내역" 탭을 열어, 상단에 3×3 그리드(2칸만 채워짐)가 보이는지 확인. "승거래"는 수익(+7%)인데 `verdict: 'lose'`이므로 그리드 셀이 **빨간색**(패 우선)으로 표시되는지, "레거시거래"(verdict 없음, profit<0)는 자동으로 빨간색인지 확인. "승률" 통계 카드도 0%(2건 다 패로 집계: 승거래는 verdict='lose'로 패, 레거시거래는 profit<0이라 패)인지 확인. 확인 후 콘솔에서 정리:

```js
localStorage.setItem('jb-history', JSON.stringify([]));
```

Expected: 그리드에 2칸 표시, 둘 다 빨간색(승거래는 verdict 우선이라 수익이어도 패로 표시), 승률 0%.

- [ ] **Step 7: 커밋**

```bash
git add index.html
git commit -m "feat: add win-rate verdict fallback and 3x3 recent-trades summary grid"
```
