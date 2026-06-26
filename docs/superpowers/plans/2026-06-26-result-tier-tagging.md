# 결과 입력 — 익절/손절 시나리오(목표가 티어) 태깅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결과 입력 시(계획 탭 결과입력 모달 / 입력 탭 수기 백필) 매도가 기준가 대비 어느 수익률 구간(손절/+3%목표부족/+3%/+5%/+7%)에 해당하는지 자동으로 태깅하고, 매매내역에서 그 태그를 확인할 수 있게 한다.

**Architecture:** `index.html` 단일 파일 내 순수 JS 함수 추가/수정만으로 구현한다. 새 헬퍼 함수 `tierTag(rate)`가 등급을 계산하고, 계획 탭은 매도 행마다 태그를 붙이고 입력 탭은 단일 매도값에 태그를 붙인다. 기존 Google Sheets 컬럼 구조와 Apps Script(`Code.gs`)는 전혀 건드리지 않는다 — 기존 텍스트 필드(상태 컬럼, 매도가 컬럼)의 문자열 포맷만 풍부해진다.

**Tech Stack:** Vanilla HTML5/CSS3/JS, localStorage, Google Apps Script Web App(변경 없음), GitHub Pages.

## Global Constraints

- 태그는 **자동 계산만** 한다. 사용자가 직접 고르거나 수정하는 UI는 추가하지 않는다(설계 문서 Non-Goals, 사용자 확정).
- 결과입력 모달이나 입력 탭에 실시간 미리보기는 추가하지 않는다 — 저장 후 매매내역 화면에서 보이는 것으로 충분하다(사용자 확정).
- 등급 함수는 한 곳(`tierTag`)에서만 정의하고 계획 탭/입력 탭 양쪽이 이걸 참조한다(`REGIME_LABEL`과 같은 패턴, DRY).
- 등급 순서(낮음→높음): `손절 < +3%목표부족 < +3% < +5% < +7%`. 이 정확한 문자열과 순서를 모든 태스크에서 동일하게 쓴다.
- 판정 기준: `rate = (매도가 - 기준가) / 기준가`. `rate < 0`이면 무조건 `손절`(커스텀 손절가인지 -7% 자동인지는 구분하지 않음 — 기존 `status` 계산의 `profit >= 0 ? '수익' : '손절'` 철학과 동일).
- Google Sheets 컬럼 개수/위치는 절대 바꾸지 않는다. `Code.gs` 수정·재배포는 이번 작업에 없다.
- 설계 문서: `docs/superpowers/specs/2026-06-26-result-tier-tagging-design.md`.

---

### Task 1: `tierTag()` 헬퍼 함수 + 등급 순서 상수

**Files:**
- Modify: `jb-journal/index.html:576-589` (`tradingDaysSince()` 바로 다음, `renderPlans()` 바로 앞)

**Interfaces:**
- Produces: `const TIER_RANK = ['손절', '+3%목표부족', '+3%', '+5%', '+7%']`, `function tierTag(rate)` → `string`(`TIER_RANK`의 값 중 하나).
- Consumed by: Task 2(`saveResult`, `finalizePlan`), Task 4(`saveTrade`).

- [ ] **Step 1: 헬퍼 함수 삽입**

다음을 찾아:

```js
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

아래로 교체:

```js
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

  // 매도가 기준가 대비 어느 구간에 해당하는지 자동 판정.
  // rate가 음수면 손절가 종류(커스텀/-7%자동) 구분 없이 무조건 '손절'.
  const TIER_RANK = ['손절', '+3%목표부족', '+3%', '+5%', '+7%'];
  function tierTag(rate) {
    if (rate < 0) return '손절';
    if (rate < 0.03) return '+3%목표부족';
    if (rate < 0.05) return '+3%';
    if (rate < 0.07) return '+5%';
    return '+7%';
  }

  function renderPlans() {
```

- [ ] **Step 2: 브라우저 콘솔에서 동작 확인**

`index.html`을 브라우저에서 직접 연 뒤(파일 더블클릭 또는 `file://` 경로), 개발자 도구 콘솔에서:

```js
console.log(tierTag(-0.02), tierTag(0.01), tierTag(0.03), tierTag(0.05), tierTag(0.08));
```

Expected: `손절 +3%목표부족 +3% +5% +7%`

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: add tierTag helper for result-entry profit-tier classification"
```

---

### Task 2: 계획 탭 — 매도 행에 티어 태그 부여 및 전파

**Files:**
- Modify: `jb-journal/index.html:753-760` (`saveResult()`, `rows` 배열 생성부)
- Modify: `jb-journal/index.html:802` (`finalizePlan()`, `status` 계산)
- Modify: `jb-journal/index.html:804-814` (`finalizePlan()`, `hist` 객체 — 변경 없이 그대로 두되, 아래 Step에서 `status` 재사용 확인)
- Modify: `jb-journal/index.html:817` (`finalizePlan()`, `sellPriceCol` 계산)

**Interfaces:**
- Consumes: Task 1의 `tierTag(rate)`, `TIER_RANK`.
- Produces: 매도 객체에 `tag` 필드(`{price, qty, date, tax, phase, memo, tag}`) — Task 3(`renderHistory`)가 `s.tag`로 읡음.

- [ ] **Step 1: `saveResult()`에서 매도 행에 `tag` 부여**

다음을 찾아:

```js
    const rows = Array.from(document.querySelectorAll('#sell-rows .sell-row')).map(row => ({
      price: parseFloat(row.querySelector('.sr-price').value) || 0,
      qty: parseFloat(row.querySelector('.sr-qty').value) || 0,
      date: row.querySelector('.sr-date').value,
      tax: parseFloat(row.querySelector('.sr-tax').value) || 0,
      phase: info.phase,
      memo: row.querySelector('.sr-memo').value.trim()
    })).filter(r => r.price > 0 && r.qty > 0 && r.date);
```

아래로 교체:

```js
    const rows = Array.from(document.querySelectorAll('#sell-rows .sell-row')).map(row => {
      const price = parseFloat(row.querySelector('.sr-price').value) || 0;
      return {
        price,
        qty: parseFloat(row.querySelector('.sr-qty').value) || 0,
        date: row.querySelector('.sr-date').value,
        tax: parseFloat(row.querySelector('.sr-tax').value) || 0,
        phase: info.phase,
        memo: row.querySelector('.sr-memo').value.trim(),
        tag: tierTag((price - info.base) / info.base)
      };
    }).filter(r => r.price > 0 && r.qty > 0 && r.date);
```

- [ ] **Step 2: `finalizePlan()`에서 최고 등급(`bestTag`) 계산 후 `status`에 덧붙이기**

다음을 찾아:

```js
    const status = (profit >= 0 ? '수익' : '손절') + `(${plan.sells.length}차분할)`;
```

아래로 교체:

```js
    const bestTag = plan.sells.reduce((best, s) =>
      TIER_RANK.indexOf(s.tag) > TIER_RANK.indexOf(best) ? s.tag : best,
      plan.sells[0].tag);
    const status = (profit >= 0 ? '수익' : '손절') + `(${plan.sells.length}차분할) · 최고 ${bestTag}`;
```

- [ ] **Step 3: `sellPriceCol`에 매도 건별 태그를 인라인으로 추가**

다음을 찾아:

```js
    const sellPriceCol = plan.sells.map(s => `${s.price}(${s.qty}주)`).join(' / ');
```

아래로 교체:

```js
    const sellPriceCol = plan.sells.map(s => `${s.price}(${s.qty}주)[${s.tag}]`).join(' / ');
```

- [ ] **Step 4: 브라우저에서 전체 흐름 확인**

`index.html`을 브라우저에서 열고:
1. "계획" 탭에서 임의 종목 추가(1차매수가 10000, 수량 10, 장세 선택).
2. 카드의 "결과 입력" 클릭 → 매도가 10700(=+7%), 수량 10, 매도일 오늘로 입력 → 저장하기.
3. "✅ 저장 완료!" 토스트가 뜨는지 확인.
4. "매매내역" 탭으로 이동 — 아직 Task 3 전이라 화면에 태그 배지는 안 보이지만, 개발자 도구 콘솔에서 `JSON.parse(localStorage.getItem('jb-history'))[0].status`를 실행해 `"수익(1차분할) · 최고 +7%"` 형태인지, `[0].sells[0].tag`가 `"+7%"`인지 확인.

Expected: `status`에 `· 최고 +7%`가 포함되고, `sells[0].tag === '+7%'`.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: tag plan-tab sell rows with profit tier and propagate to status/sheets"
```

---

### Task 3: 매매내역 화면에 티어 태그 배지 표시

**Files:**
- Modify: `jb-journal/index.html:959-963` (`renderHistory()`, `sellLines` 계산)

**Interfaces:**
- Consumes: Task 2가 만든 `h.sells[].tag` (없을 수도 있음 — 레거시 데이터 호환).

- [ ] **Step 1: 매도 줄에 태그 배지 추가**

다음을 찾아:

```js
      const sellLines = (h.sells || []).map(s => {
        const tag = h.use2 ? (s.phase === 2 ? ' <span style="color:var(--orange);">[평단]</span>' : ' <span style="color:var(--blue);">[1차]</span>') : '';
        const memo = s.memo ? ` — ${s.memo}` : '';
        return `<div class="hist-meta">${s.date} · ${(s.price || 0).toLocaleString('ko-KR')}원 × ${s.qty}주${tag}${memo}</div>`;
      }).join('');
```

아래로 교체:

```js
      const sellLines = (h.sells || []).map(s => {
        const tag = h.use2 ? (s.phase === 2 ? ' <span style="color:var(--orange);">[평단]</span>' : ' <span style="color:var(--blue);">[1차]</span>') : '';
        const tierBadge = s.tag ? ` <span style="color:var(--accent);">[${s.tag}]</span>` : '';
        const memo = s.memo ? ` — ${s.memo}` : '';
        return `<div class="hist-meta">${s.date} · ${(s.price || 0).toLocaleString('ko-KR')}원 × ${s.qty}주${tag}${tierBadge}${memo}</div>`;
      }).join('');
```

- [ ] **Step 2: 브라우저에서 확인**

Task 2의 Step 4에서 만든 테스트 거래가 남아있는 상태로 "매매내역" 탭을 열어, 매도 줄에 `[+7%]` 배지가 빨간/강조색(`--accent`)으로 표시되는지 확인. 그 다음 개발자 도구 콘솔에서 아래를 실행해 레거시(태그 없는) 데이터도 깨지지 않는지 확인:

```js
const h = JSON.parse(localStorage.getItem('jb-history'));
h.push({id: 999999, date: '2026-01-01', name: '레거시테스트', code: '000000', status: '수익(1차분할)', avg: 10000, sells: [{price: 10500, qty: 10, date: '2026-01-01', tax: 0, phase: 1, memo: ''}], totalQty: 10, profit: 5000, rate: 0.05, tax: 0, use2: false, regime: null});
localStorage.setItem('jb-history', JSON.stringify(h));
```

페이지를 새로고침하고 "매매내역" 탭에서 "레거시테스트" 항목이 태그 배지 없이(에러 없이) 표시되는지 확인한 뒤, 콘솔에서 아래로 테스트 데이터를 정리:

```js
const h2 = JSON.parse(localStorage.getItem('jb-history')).filter(x => x.id !== 999999);
localStorage.setItem('jb-history', JSON.stringify(h2));
```

Expected: 태그 있는 거래는 `[+7%]` 배지 표시, 레거시(태그 없는) 거래는 배지 없이 정상 표시, 콘솔 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: show profit-tier badge per sell line in trade history"
```

---

### Task 4: 입력 탭 — 매도가 입력 시 상태값에 티어 덧붙이기

**Files:**
- Modify: `jb-journal/index.html:896-912` (`saveTrade()`, `row` 배열 생성부)

**Interfaces:**
- Consumes: Task 1의 `tierTag(rate)`.

- [ ] **Step 1: 상태 컬럼에 티어 텍스트 추가**

다음을 찾아:

```js
    const row = [
      document.getElementById('buyDate').value,
      document.getElementById('stockName').value,
      document.getElementById('stockCode').value,
      b1, q1, b1*q1, Math.round(b1*1.03),
      use2?b2:'', use2?q2:'', use2?b2*q2:'',
      Math.round(avg), totalAmt, Math.round(avg*0.93),
      Math.round(avg*1.03), Math.round(avg*1.05), Math.round(avg*1.07),
      Math.round(totalAmt*0.07),
      document.getElementById('sellDate').value,
      sell||'',
      sell>0?Math.round((sell-avg)*totalQty):'',
      sell>0?((sell-avg)/avg).toFixed(4):'',
      '', document.getElementById('tradeStatus').value,
      '케이스'+currentCase, getReasons(),
      REGIME_LABEL[entryRegime] || '', '', '', '', document.getElementById('memo').value
    ];
```

아래로 교체:

```js
    const statusVal = sell > 0
      ? document.getElementById('tradeStatus').value + ' · ' + tierTag((sell - avg) / avg)
      : document.getElementById('tradeStatus').value;
    const row = [
      document.getElementById('buyDate').value,
      document.getElementById('stockName').value,
      document.getElementById('stockCode').value,
      b1, q1, b1*q1, Math.round(b1*1.03),
      use2?b2:'', use2?q2:'', use2?b2*q2:'',
      Math.round(avg), totalAmt, Math.round(avg*0.93),
      Math.round(avg*1.03), Math.round(avg*1.05), Math.round(avg*1.07),
      Math.round(totalAmt*0.07),
      document.getElementById('sellDate').value,
      sell||'',
      sell>0?Math.round((sell-avg)*totalQty):'',
      sell>0?((sell-avg)/avg).toFixed(4):'',
      '', statusVal,
      '케이스'+currentCase, getReasons(),
      REGIME_LABEL[entryRegime] || '', '', '', '', document.getElementById('memo').value
    ];
```

- [ ] **Step 2: 브라우저에서 확인**

`index.html`을 브라우저에서 열고 "입력" 탭에서: 1차매수가 10000, 수량 10, 장세 선택, 매도가 10500(=+5%), 매도일/종목명/코드 입력, 상태는 "수익(1차만)" 선택 후 저장하기 클릭. 개발자 도구 Network 탭에서 Apps Script로 보낸 POST 요청의 body(`row` 배열의 22번째 요소, 0-indexed)가 `"수익(1차만) · +5%"`인지 확인. (`mode:'no-cors'`라 응답 본문은 못 보지만 요청 payload는 Network 탭의 Request 내용에서 확인 가능.)

매도가를 비워두고("보유중" 상태로) 저장할 경우 상태값에 티어가 붙지 않고 `"보유중"` 그대로인지도 확인.

Expected: 매도가 입력 시 `"수익(1차만) · +5%"` 형태, 매도가 없으면 `"보유중"` 그대로.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: append profit tier to manual entry trade status"
```
