# 1차/2차 단계별 매도 + 매도 메모 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결과 입력 모달의 "2차 매수 실제 체결" 토글을 영구 1회성 단방향 스위치로 만들어서, 같은 plan 안에서 "1차 단가 기준 매도 → (2차 매수 완료 후) 평단가로 전환 → 평단가 기준 매도"가 자연스럽게 이어지게 한다. 매도건마다 `phase`(1|2) 태그와 자유 텍스트 `memo`를 남길 수 있게 한다.

**Architecture:** 순수 프론트엔드(`index.html`) 변경만으로 구현한다. `apps-script/Code.gs`는 **변경하지 않는다** — 새로 추가되는 `phase`/`memo` 필드는 기존에 `JSON.stringify(plan.sells)`로 한 셀에 통째로 직렬화/역직렬화되는 `sells[]` 배열의 항목(per-sell) 속성이라, Apps Script 쪽이 그 구조를 모른 채로도 그대로 통과(pass-through)된다. `phase2Pool`/`phase2Avg`는 plan-level persisted 필드로 두지 않고, **매번 `plan.b1, plan.q1, plan.b2, plan.q2, plan.sells`로부터 derive하는 계산값**으로 둔다(Sheets 컬럼 추가/Code.gs 수정/수동 재배포 불필요). 이 프로젝트엔 빌드/테스트 도구가 없으므로, 각 태스크의 검증은 브라우저에서 직접 동작 확인(가능하면 Playwright)으로 한다.

**Tech Stack:** Vanilla HTML5/CSS3/JS, Google Apps Script Web App(변경 없음), localStorage, GitHub Pages.

## Global Constraints

- 변경 범위는 "계획" 탭의 결과 입력 모달 + 관련 데이터 흐름(`plan.sells[]`의 항목 shape, `plan.use2`의 의미, localStorage 매매내역, 31열 Sheets row export)에만 한정한다. "입력" 탭의 수동 거래입력 폼(`saveTrade()`, `calcAll()` 등)은 건드리지 않는다.
- `apps-script/Code.gs`는 이 plan 전체에서 **수정하지 않는다.** Plans 시트의 11컬럼(`id,date,name,code,b1,q1,b2,q2,custSL,sellsJson,use2`) 레이아웃도 그대로 유지한다. 새 plan-level 컬럼을 추가하지 않으므로 수동 Apps Script 재배포가 필요 없다.
- `phase2Pool`/`phase2Avg`는 persisted 필드가 아니라, `phaseInfo(plan, useSecondPhase)`라는 단일 공유 헬퍼로 그때그때 계산하는 derived 값이다. 이 헬퍼가 holdings 표시(`updateHoldingsInfo`)/저장 검증(`saveResult`)/최종 손익 계산(`finalizePlan`) 세 곳에서 공통으로 쓰인다 — remaining-qty/cost-basis 계산식이 한 곳에만 존재해야 한다.
- `plan.use2`는 한 번 `true`가 되면 영구 고정(되돌릴 수 없음) — `saveResult()`에서 절대로 `plan.use2 = false`를 대입하지 않는다(`undefined → true` 전환만 허용).
- 모달이 열렸을 때 `plan.use2`가 아직 `true`로 고정되지 않은 상태라면, 토글의 기본값은 **OFF**다(기존 코드의 기본 ON에서 의도적으로 변경).
- 레거시 데이터(`sells[].phase`가 `undefined`)는 `phase 1`로 취급한다. 레거시 history 항목(`h.use2`가 없음)은 단계 태그를 표시하지 않는다.
- 설계 문서: `docs/superpowers/specs/2026-06-21-staged-sell-design.md` (이 plan의 모든 계산식/조건은 이 문서 + 이 plan에서 검증한 derive 근거를 따른다).

---

### Task 1: 공유 헬퍼 `phaseInfo()` 추가

**Files:**
- Modify: `jb-journal/index.html` — `updateHoldingsInfo` 함수(현재 593번째 줄 부근) 자리에 새 함수 삽입 + 본문 교체.

**Interfaces:**
- Produces: `function phaseInfo(plan, useSecondPhase)` — 반환값 `{ phase: 1|2, base: number, pool: number, sold: number }`.
- Consumes: `plan.b1, plan.q1, plan.b2, plan.q2, plan.sells`(각 항목의 `.phase`, `.qty`).
- Consumed by: Task 2의 `updateHoldingsInfo`, Task 4의 `saveResult`, Task 5의 `finalizePlan`.

- [ ] **Step 1: `phaseInfo()` 추가 + `updateHoldingsInfo()` 교체**

다음을 찾아:

```js
  function updateHoldingsInfo(plan) {
    const hasB2 = !!(plan.b2 && plan.q2);
    const totalQty = (hasB2 && modalUse2) ? plan.q1 + plan.q2 : plan.q1;
    const soldQty = plan.sells.reduce((s, x) => s + x.qty, 0);
    document.getElementById('modal-holdings-info').textContent = `총 ${totalQty}주 · 매도완료 ${soldQty}주 · 남음 ${totalQty - soldQty}주`;
  }
```

아래로 교체:

```js
  function phaseInfo(plan, useSecondPhase) {
    const hasB2 = !!(plan.b2 && plan.q2);
    const sells = plan.sells || [];
    const phase1Sold = sells.filter(s => (s.phase || 1) === 1).reduce((s, x) => s + x.qty, 0);

    if (!hasB2 || !useSecondPhase) {
      return { phase: 1, base: plan.b1, pool: plan.q1, sold: phase1Sold };
    }
    const remainingQ1 = plan.q1 - phase1Sold;
    const pool2 = remainingQ1 + plan.q2;
    const base2 = (plan.b1 * remainingQ1 + plan.b2 * plan.q2) / pool2;
    const phase2Sold = sells.filter(s => s.phase === 2).reduce((s, x) => s + x.qty, 0);
    return { phase: 2, base: base2, pool: pool2, sold: phase2Sold };
  }

  function updateHoldingsInfo(plan) {
    const info = phaseInfo(plan, modalUse2);
    document.getElementById('modal-holdings-info').textContent =
      `총 ${info.pool}주 · 매도완료 ${info.sold}주 · 남음 ${info.pool - info.sold}주`;
  }
```

주의: `updateHoldingsInfo`의 의미가 바뀐다 — 기존엔 "plan 전체의 총수량/매도완료/남음"이었지만, 이제는 "**현재 단계**의 풀/매도완료/남음"이다(의도된 동작 변경, Task 2 Step 2에서 숫자로 확인).

- [ ] **Step 2: 브라우저 콘솔에서 단위 동작 확인**

`index.html`을 브라우저에서 열고 개발자 콘솔에서:

```js
const testPlan = { b1: 10000, q1: 100, b2: 9500, q2: 100, sells: [{ price: 10300, qty: 50, phase: 1 }] };
console.log(phaseInfo(testPlan, false));
// Expected: { phase: 1, base: 10000, pool: 100, sold: 50 }
console.log(phaseInfo(testPlan, true));
// Expected: { phase: 2, base: 9666.666666666666, pool: 150, sold: 0 }
//   (remainingQ1 = 100-50=50, pool2 = 50+100=150, base2 = (10000*50+9500*100)/150 = 9666.67)
```

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: add phaseInfo() shared helper for staged cost-basis calc"
```

---

### Task 2: `openModal()` — 토글 노출 조건, 기본값 OFF

**Files:**
- Modify: `jb-journal/index.html:568-591` (`openModal`)

**Interfaces:**
- Consumes: Task 1의 `phaseInfo()`(간접적으로, `updateHoldingsInfo` 경유).
- Produces: `modalUse2`의 기본값 로직 변경, `#modal-use2-row` 노출 조건 변경.

- [ ] **Step 1: 토글 기본값/노출 조건 교체**

다음을 찾아:

```js
    const hasB2 = !!(plan.b2 && plan.q2);
    modalUse2 = plan.use2 !== undefined ? plan.use2 : true;

    document.getElementById('modal-stock-name').textContent = plan.name + (plan.code ? ` (${plan.code})` : '');
    document.getElementById('modal-stock-info').textContent = `1차 ${w(plan.b1)} × ${plan.q1}주` + (plan.b2 ? ` · 2차 ${w(plan.b2)} × ${plan.q2}주` : '');

    const use2Row = document.getElementById('modal-use2-row');
    use2Row.classList.toggle('hidden', !hasB2 || plan.sells.length > 0);
    document.getElementById('modal-use2-toggle').classList.toggle('on', modalUse2);
```

아래로 교체:

```js
    const hasB2 = !!(plan.b2 && plan.q2);
    modalUse2 = plan.use2 === true ? true : false;

    document.getElementById('modal-stock-name').textContent = plan.name + (plan.code ? ` (${plan.code})` : '');
    document.getElementById('modal-stock-info').textContent = `1차 ${w(plan.b1)} × ${plan.q1}주` + (plan.b2 ? ` · 2차 ${w(plan.b2)} × ${plan.q2}주` : '');

    const use2Row = document.getElementById('modal-use2-row');
    use2Row.classList.toggle('hidden', !hasB2 || plan.use2 === true);
    document.getElementById('modal-use2-toggle').classList.toggle('on', modalUse2);
```

`toggleUse2()`(600-605번째 줄)는 본문 수정이 필요 없다(Step 1에서 이미 `updateHoldingsInfo`가 Task 1의 `phaseInfo()` 기반으로 바뀌어 있으므로 자동으로 맞물린다) — 변경 없음을 확인만 한다.

- [ ] **Step 2: 브라우저에서 동작 확인**

1차 10000원×100주, 2차 9500원×100주인 계획을 새로 만들고 결과 입력 모달을 연다.

확인 항목:
- 토글이 보이고, 기본값이 **OFF**(이전엔 ON이 기본이었음 — 변경 확인)
- "총 100주 · 매도완료 0주 · 남음 100주" 표시(1차 풀만, OFF 상태이므로 `phaseInfo(plan, false).pool` = `plan.q1` = 100)
- 토글을 ON으로 켜면 "총 200주 · 매도완료 0주 · 남음 200주"로 바뀜(remainingQ1 = q1(100) - phase1Sold(0) = 100, pool2 = 100+100 = 200)
- 모달을 취소하고 다시 열면 토글이 다시 OFF로 초기화됨(아직 `plan.use2`가 고정되지 않았으므로)

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: default use2 toggle to OFF, extend visibility until permanently flipped"
```

---

### Task 3: `addSellRow()` — 메모 입력칸 추가

**Files:**
- Modify: `jb-journal/index.html:607-625` (`addSellRow`)

**Interfaces:**
- Produces: 각 `.sell-row`에 `.sr-memo` input(text) 추가. Task 4의 `saveResult()`가 이 클래스를 읽음.

- [ ] **Step 1: `addSellRow()`의 행 템플릿 교체**

다음을 찾아:

```js
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
      <div class="row2" style="margin-top:8px;">
        <div><label>매도일</label><input type="date" class="sr-date" value="${new Date().toISOString().split('T')[0]}"></div>
        <div><label>세금 (원, 선택)</label><input type="number" class="sr-tax" placeholder="0"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="sr-del" onclick="removeSellRow(this)">✕ 삭제</button>
      </div>`;
    wrap.appendChild(div);
  }
```

아래로 교체:

```js
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
      <div class="row2" style="margin-top:8px;">
        <div><label>매도일</label><input type="date" class="sr-date" value="${new Date().toISOString().split('T')[0]}"></div>
        <div><label>세금 (원, 선택)</label><input type="number" class="sr-tax" placeholder="0"></div>
      </div>
      <div style="margin-top:8px;">
        <label>메모 (선택)</label><input type="text" class="sr-memo" placeholder="예: 반등 약해서 일부 정리">
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="sr-del" onclick="removeSellRow(this)">✕ 삭제</button>
      </div>`;
    wrap.appendChild(div);
  }
```

- [ ] **Step 2: 브라우저에서 확인**

결과 입력 모달을 열고, 매도 행에 매도가/수량 → 매도일/세금 → 메모(선택) 순서로 입력칸이 보이는지 확인. "+ 매도 추가"로 행을 늘려도 각 행에 메모 칸이 똑같이 있는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: add per-row memo input to result modal sell rows"
```

---

### Task 4: `saveResult()` — phase 태그, memo 읽기, `use2` 단방향 대입, phase-aware 검증

**Files:**
- Modify: `jb-journal/index.html:638-672` (`saveResult`)

**Interfaces:**
- Consumes: Task 1의 `phaseInfo()`, Task 3의 `.sr-memo`.
- Produces: `plan.sells` 항목 shape이 `{price,qty,date,tax,phase,memo}`로 확장. `plan.use2`가 `undefined → true`로만 전환. 검증이 phase-aware 잔량 기준으로 바뀜. finalize 판정은 plan 전체 totalQty 기준.

- [ ] **Step 1: `saveResult()` 전체 교체**

다음을 찾아:

```js
  function saveResult() {
    const plan = plans.find(p => p.id === modalPlanId);
    if (!plan) return;

    const rows = Array.from(document.querySelectorAll('#sell-rows .sell-row')).map(row => ({
      price: parseFloat(row.querySelector('.sr-price').value) || 0,
      qty: parseFloat(row.querySelector('.sr-qty').value) || 0,
      date: row.querySelector('.sr-date').value,
      tax: parseFloat(row.querySelector('.sr-tax').value) || 0
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
      finalizePlan(plan);
      closeModal();
      showToast('✅ 저장 완료!');
    } else {
      fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'plan-update', plan }) });
      renderPlans();
      closeModal();
      showToast('✅ 부분 매도 저장됨. 잔량은 계획에 남아있습니다.');
    }
  }
```

아래로 교체:

```js
  function saveResult() {
    const plan = plans.find(p => p.id === modalPlanId);
    if (!plan) return;

    const info = phaseInfo(plan, modalUse2);

    const rows = Array.from(document.querySelectorAll('#sell-rows .sell-row')).map(row => ({
      price: parseFloat(row.querySelector('.sr-price').value) || 0,
      qty: parseFloat(row.querySelector('.sr-qty').value) || 0,
      date: row.querySelector('.sr-date').value,
      tax: parseFloat(row.querySelector('.sr-tax').value) || 0,
      phase: info.phase,
      memo: row.querySelector('.sr-memo').value.trim()
    })).filter(r => r.price > 0 && r.qty > 0 && r.date);

    if (!rows.length) { showToast('매도가/수량/매도일을 입력하세요.'); return; }

    const remainQty = info.pool - info.sold;
    const newQty = rows.reduce((s, x) => s + x.qty, 0);

    if (newQty > remainQty) { showToast(`남은 수량(${remainQty}주)보다 많습니다.`); return; }

    plan.sells = plan.sells.concat(rows);
    if (modalUse2 === true) plan.use2 = true;

    const hasB2 = !!(plan.b2 && plan.q2);
    const totalQty = (hasB2 && plan.use2 === true) ? plan.q1 + plan.q2 : plan.q1;
    const allSoldQty = plan.sells.reduce((s, x) => s + x.qty, 0);

    if (allSoldQty === totalQty) {
      finalizePlan(plan);
      closeModal();
      showToast('✅ 저장 완료!');
    } else {
      fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ type: 'plan-update', plan }) });
      renderPlans();
      closeModal();
      showToast('✅ 부분 매도 저장됨. 잔량은 계획에 남아있습니다.');
    }
  }
```

핵심 변경점:
- `info = phaseInfo(plan, modalUse2)`로 이번 배치가 속할 단계의 `base`/`pool`/`sold`를 얻는다. 잔량 검증은 `info.pool - info.sold`(그 단계만의 잔량)로 한다.
- 각 row에 `phase: info.phase`를 태깅한다(저장 시점의 토글 상태로 자동 결정).
- `plan.use2`는 `modalUse2 === true`일 때만 `true`로 대입한다 — `undefined → true`의 단방향 전환만 일어난다.
- 전량 매도 완료(finalize) 판정은 1차 단계 풀이 아니라 **plan 전체** `totalQty`(`hasB2 && plan.use2===true ? q1+q2 : q1`)와 `plan.sells` 전체 합으로 한다 — 1차 단계만 끝났다고 finalize 되면 안 되고(2차로 전환해서 계속 팔 수 있어야 하므로), 최종 확정된 전체 물량이 다 팔렸을 때만 finalize 되어야 한다.

- [ ] **Step 2: 브라우저에서 단계 전환 시나리오 확인**

1차 10000원×100주, 2차 9500원×100주 계획으로 결과 입력 모달 열기:

1. 토글 OFF(기본값) 상태에서 매도 행에 가격 10300, 수량 50, 메모 "반등 약해서 일부 정리" 입력 → 저장
   - Expected: 토스트 "✅ 부분 매도 저장됨...", `plan.sells`에 `{price:10300, qty:50, phase:1, memo:"반등 약해서 일부 정리"}` 추가됨(콘솔에서 `plans.find(p=>p.id===...).sells` 확인), `plan.use2`는 여전히 `undefined`
2. 같은 종목 "결과 입력" 다시 열기
   - Expected: 토글 여전히 보임(아직 `use2`가 고정 안 됐으므로), 기본값 OFF, "총 100주 · 매도완료 50주 · 남음 50주"
3. 토글을 ON으로 켬
   - Expected: "총 150주 · 매도완료 0주 · 남음 150주"로 바뀜(remainingQ1=50, pool2=50+100=150)
4. 매도 행에 가격 10700, 수량 150, 메모 "목표가 도달" 입력 → 저장
   - Expected: 토스트 "✅ 저장 완료!"(plan 전체 200주 모두 팔림), `plan.use2`가 `true`로 고정됨, 종목이 대기 목록에서 사라짐

- [ ] **Step 3: 잔량 초과 입력 시 에러 확인**

아무 종목이나 결과 입력 모달 열고, 현재 활성 단계의 풀보다 큰 수량을 입력 후 저장 → "남은 수량(...주)보다 많습니다." 토스트가 뜨고 저장되지 않는지 확인(1차 단계, 2차 단계 양쪽에서 한 번씩).

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: tag sells with phase, add memo, never un-flip use2 once true"
```

---

### Task 5: `finalizePlan()` — phase별 손익 계산, history에 `use2` 추가, Sheets row 메모 컬럼

**Files:**
- Modify: `jb-journal/index.html:674-710` (`finalizePlan`)

**Interfaces:**
- Consumes: Task 1의 `phaseInfo()`.
- Produces: `profit`/`rate`가 phase1Sells/phase2Sells로 분리 계산됨. `hist` 항목에 `use2: plan.use2 === true` 필드 추가. Sheets row 인덱스 23(0-indexed, 기존 첫 번째 trailing `''`)에 메모 컬럼 채움. row 배열 길이는 31 그대로 유지.

- [ ] **Step 1: `finalizePlan()` 전체 교체**

다음을 찾아:

```js
  function finalizePlan(plan) {
    const use2 = plan.use2 && plan.b2 && plan.q2;
    const totalQty = use2 ? plan.q1 + plan.q2 : plan.q1;
    const avg = use2 ? (plan.b1*plan.q1 + plan.b2*plan.q2)/(plan.q1+plan.q2) : plan.b1;
    const totalAmt = plan.b1*plan.q1 + (use2 ? plan.b2*plan.q2 : 0);
    const soldAmt = plan.sells.reduce((s, x) => s + x.price*x.qty, 0);
    const totalTax = plan.sells.reduce((s, x) => s + (x.tax || 0), 0);
    const profit = Math.round(soldAmt - avg*totalQty - totalTax);
    const rate = parseFloat((profit / (avg*totalQty)).toFixed(4));
    const status = (profit >= 0 ? '수익' : '손절') + `(${plan.sells.length}차분할)`;

    const hist = loadHistory();
    hist.unshift({
      id: Date.now(), date: plan.sells[plan.sells.length - 1].date,
      name: plan.name, code: plan.code, status,
      avg: Math.round(avg), sells: plan.sells, totalQty, profit, rate,
      tax: totalTax
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
      totalTax, status, '', '', '', '', '', '', '', ''
    ];
    fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ row }) });

    deletePlan(plan.id);
  }
```

아래로 교체:

```js
  function finalizePlan(plan) {
    const use2 = plan.use2 === true && !!(plan.b2 && plan.q2);
    const totalQty = use2 ? plan.q1 + plan.q2 : plan.q1;
    const avg = use2 ? (plan.b1*plan.q1 + plan.b2*plan.q2)/(plan.q1+plan.q2) : plan.b1;
    const totalAmt = plan.b1*plan.q1 + (use2 ? plan.b2*plan.q2 : 0);

    const info2 = use2 ? phaseInfo(plan, true) : null;
    const phase1Sells = plan.sells.filter(s => (s.phase || 1) === 1);
    const phase2Sells = plan.sells.filter(s => s.phase === 2);
    const profit1 = phase1Sells.reduce((s, x) => s + (x.price - plan.b1) * x.qty, 0);
    const profit2 = info2 ? phase2Sells.reduce((s, x) => s + (x.price - info2.base) * x.qty, 0) : 0;
    const totalTax = plan.sells.reduce((s, x) => s + (x.tax || 0), 0);
    const profit = Math.round(profit1 + profit2 - totalTax);
    const rate = parseFloat((profit / totalAmt).toFixed(4));
    const status = (profit >= 0 ? '수익' : '손절') + `(${plan.sells.length}차분할)`;

    const hist = loadHistory();
    hist.unshift({
      id: Date.now(), date: plan.sells[plan.sells.length - 1].date,
      name: plan.name, code: plan.code, status,
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
    fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ row }) });

    deletePlan(plan.id);
  }
```

핵심 변경점:
- `profit`을 더 이상 단일 평단가 기준 한 줄로 계산하지 않고, `phase1Sells`/`phase2Sells`로 나눠 각각 `(price-base)*qty`를 합산한다. 2차를 전혀 안 쓴 plan(`use2===false`)은 `phase2Sells`가 항상 빈 배열이므로 `profit2=0`이 되어 기존 단일-평단가 공식과 결과가 100% 동일하다(회귀 없음).
- `rate`의 분모를 `avg*totalQty`에서 `totalAmt`로 바꿨다(`avg*totalQty`는 정의상 항상 `totalAmt`와 같은 값이므로 결과는 수학적으로 동일).
- `row` 배열의 인덱스 23(기존엔 `''`)에 `memoCol`을 채운다. 인덱스 0~30(31개 요소) 구성은 그대로 유지되며, 23번 위치의 값만 바뀐다.
- `hist` 항목에 `use2: plan.use2 === true`를 추가한다 — Task 6의 `renderHistory()`가 이 값으로 "이 plan이 2차를 아예 안 썼는지"를 판단한다.

- [ ] **Step 2: Sheets row 인덱스/길이 재확인 (코드 리딩만, 브라우저 불필요)**

수정된 `row` 배열을 인덱스별로 다시 센다:

```
0:plan.date 1:plan.name 2:plan.code 3:plan.b1 4:plan.q1 5:plan.b1*plan.q1 6:round(b1*1.03)
7:b2||'' 8:q2||'' 9:b2&&q2?b2*q2:'' 10:round(avg) 11:totalAmt 12:round(avg*0.93)
13:round(avg*1.03) 14:round(avg*1.05) 15:round(avg*1.07) 16:round(totalAmt*0.07)
17:sellDateCol 18:sellPriceCol 19:profit 20:rate 21:totalTax 22:status
23:memoCol 24:'' 25:'' 26:'' 27:'' 28:'' 29:'' 30:''
```

확인: 인덱스 0부터 30까지 총 31개 요소(변경 전과 동일한 길이), 인덱스 23만 `''`에서 `memoCol`으로 값이 바뀜.

- [ ] **Step 3: 브라우저에서 phase별 손익 계산 확인**

Task 4 Step 2 시나리오(1차 10000×100, 2차 9500×100, 1차 단계에서 50주@10300, 평단가 전환 후 150주@10700)의 finalize 결과를 "내역" 탭에서 확인.

기대값 계산:
- `phase1 profit = (10300-10000)*50 = 15,000`
- `remainingQ1 = 50`, `phase2Avg = (10000*50+9500*100)/150 = 9,666.67`
- `phase2 profit = (10700-9666.67)*150 = 155,000`
- `totalTax = 0`(세금 입력 안 했다면)
- `profit = round(15,000+155,000-0) = 170,000원`
- `totalAmt = 10000*100+9500*100 = 1,950,000`
- `rate = 170,000/1,950,000 ≈ +8.72%`

"내역" 탭에서 수익금 `+170,000원`, 수익률 `+8.72%`로 표시되는지 확인(Task 6 완료 전에는 phase 태그/메모 줄 자체는 아직 안 보여도 정상 — 숫자만 먼저 확인).

- [ ] **Step 4: 회귀 확인 — 2차를 전혀 안 쓴 plan**

1차 10000원×100주(2차 없음) 계획으로 전량 100주 한 번에 10500원에 매도 → finalize.

기대값: `phase1 profit = (10500-10000)*100 = 50,000`, `phase2 profit = 0`, `profit = 50,000원`, `totalAmt = 1,000,000`, `rate = 5.00%`. `docs/superpowers/plans/2026-06-19-sell-tax.md` 적용 후 기준과 동일한 결과인지 확인.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: split profit calc by phase, add use2 to history, add memo column to sheets row"
```

---

### Task 6: `renderHistory()` — 매도건별 phase 태그 + 메모 표시

**Files:**
- Modify: `jb-journal/index.html:810-845` (`renderHistory`)

**Interfaces:**
- Consumes: Task 5가 저장하는 `hist` 항목의 `use2` 필드, `sells[].phase`/`sells[].memo`(레거시 항목은 둘 다 없을 수 있음).

- [ ] **Step 1: `.hist-meta` 줄 아래에 매도건별 줄 추가**

다음을 찾아:

```js
    list.innerHTML = hist.map(h => `
      <div class="hist-item">
        <div class="hist-left">
          <div class="hist-name">${h.name}${h.code?` <span style="font-size:11px;color:var(--muted);">${h.code}</span>`:''}</div>
          <div class="hist-meta">${h.date} · ${h.status}${h.sells && h.sells.length > 1 ? ` · ${h.sells.length}건 분할매도` : ''}</div>
        </div>
        <div class="hist-right">
          <div class="hist-profit ${h.profit>=0?'green':'red'}">${h.profit>=0?'+':''}${h.profit.toLocaleString('ko-KR')}원</div>
          <div class="hist-rate">${(h.rate*100)>=0?'+':''}${(h.rate*100).toFixed(2)}%</div>
          ${h.tax > 0 ? `<div class="hist-tax">세금 -${h.tax.toLocaleString('ko-KR')}원</div>` : ''}
        </div>
        <button class="hist-del" onclick="deleteHistory(${h.id})">✕</button>
      </div>`).join('');
```

아래로 교체:

```js
    list.innerHTML = hist.map(h => {
      const sellLines = (h.sells || []).map(s => {
        const tag = h.use2 ? (s.phase === 2 ? ' <span style="color:var(--orange);">[평단]</span>' : ' <span style="color:var(--blue);">[1차]</span>') : '';
        const memo = s.memo ? ` — ${s.memo}` : '';
        return `<div class="hist-meta">${s.date} · ${s.price.toLocaleString('ko-KR')}원 × ${s.qty}주${tag}${memo}</div>`;
      }).join('');

      return `
      <div class="hist-item">
        <div class="hist-left">
          <div class="hist-name">${h.name}${h.code?` <span style="font-size:11px;color:var(--muted);">${h.code}</span>`:''}</div>
          <div class="hist-meta">${h.date} · ${h.status}${h.sells && h.sells.length > 1 ? ` · ${h.sells.length}건 분할매도` : ''}</div>
          ${sellLines}
        </div>
        <div class="hist-right">
          <div class="hist-profit ${h.profit>=0?'green':'red'}">${h.profit>=0?'+':''}${h.profit.toLocaleString('ko-KR')}원</div>
          <div class="hist-rate">${(h.rate*100)>=0?'+':''}${(h.rate*100).toFixed(2)}%</div>
          ${h.tax > 0 ? `<div class="hist-tax">세금 -${h.tax.toLocaleString('ko-KR')}원</div>` : ''}
        </div>
        <button class="hist-del" onclick="deleteHistory(${h.id})">✕</button>
      </div>`;
    }).join('');
```

설계 의도:
- `h.use2`가 `true`가 아니면(2차를 아예 안 쓴 plan, 또는 레거시 항목으로 `h.use2`가 `undefined`인 경우) `tag`는 빈 문자열 — 단계 구분 자체를 안 보여준다.
- `h.use2`가 `true`인 plan에서는 `s.phase===2`만 `[평단]`, 그 외(1 또는 레거시 `undefined`)는 `[1차]`로 표시.
- `s.memo`가 없거나 빈 문자열이면 메모 부분이 생략됨.
- `h.sells`가 없는 매우 오래된 레거시 항목에서도 `(h.sells || [])`로 안전 처리.

- [ ] **Step 2: 브라우저에서 확인**

"내역" 탭 열기:
- Task 5 Step 3 항목에 다음 두 줄이 표시되는지 확인:
  ```
  2026-06-21 · 10,300원 × 50주 [1차] — 반등 약해서 일부 정리
  2026-06-21 · 10,700원 × 150주 [평단] — 목표가 도달
  ```
- Task 5 Step 4 항목(2차 안 쓴 plan)에는 `[1차]`/`[평단]` 태그가 전혀 안 보이고 단순히 `날짜 · 가격 × 수량`만 표시되는지 확인.
- 기존(이번 기능 적용 전) 레거시 history 항목(있다면)이 에러 없이 그대로 표시되는지(콘솔에 에러 없음) 확인.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: show per-sell phase tag and memo breakdown in trade history"
```

---

### Task 7: 백엔드 변경 없음 — 명시적 확인 (코드 작업 아님)

**Files:** 없음(검증 및 명시적 진술만)

- [ ] **Step 1: 왜 백엔드 변경이 필요 없는지 재확인**

1. `plan.sells[]`의 각 항목에 추가되는 `phase`/`memo`는 per-sell 속성이다. `Code.gs`의 `plan-save`/`plan-update` 핸들러(13-45번째 줄)는 `JSON.stringify(p.sells || [])`로 `sells` 배열 전체를 Plans 시트의 9번째 컬럼(0-indexed, `sellsJson`) 한 셀에 문자열로 직렬화한다. `JSON.stringify`는 알려지지 않은 추가 키도 그대로 직렬화하므로 `phase`/`memo`가 round-trip된다.
2. `initPlans()`(460-480번째 줄)의 `sells: r[9] ? JSON.parse(r[9]) : []`도 제너릭하게 동작하므로 손실 없음.
3. `phase2Pool`/`phase2Avg`는 Task 1의 `phaseInfo()`가 `plan.b1, plan.q1, plan.b2, plan.q2, plan.sells`로부터 매번 다시 계산하는 값이므로, Plans 시트에 새 컬럼을 추가할 필요가 없다(11컬럼 레이아웃 그대로).
4. `renderPlans()`의 진행률 표시(`sells.reduce((s,x)=>s+x.qty,0)`, 544-548번째 줄)는 `.qty`만 읽으므로 `phase`/`memo` 추가에 영향받지 않는다.

- [ ] **Step 2: `apps-script/Code.gs` 무변경 확인**

```bash
git diff apps-script/Code.gs
```

Expected: 출력 없음.

- [ ] **Step 3: 수동 Apps Script 재배포가 필요 없음을 사용자에게 명시**

이 기능은 `index.html` 단일 파일 변경으로 완결되며, 수동 재배포가 필요 없음을 최종 보고에 명시한다.

(이 Task는 커밋 대상이 없으므로 git commit 생략.)

---

### Task 8: 전체 End-to-End 시나리오 확인 + 회귀 확인 + 최종 커밋

**Files:** 없음(검증만, 문제 발견 시에만 수정 후 커밋)

- [ ] **Step 1: 시나리오 A — 전체 staged 흐름**

종목 추가: 1차 10000원×100주, 2차 9500원×100주.

1. 결과 입력 모달 열기 → 토글 기본 OFF 확인 → "총 100주 · 매도완료 0주 · 남음 100주" 확인
2. 매도 행: 가격 10300, 수량 50, 메모 "반등 약해서 일부 정리" → 저장 → "✅ 부분 매도 저장됨..." 토스트, 대기 목록에 남음
3. 다시 열기 → 토글 OFF(기본값), "총 100주 · 매도완료 50주 · 남음 50주" 확인
4. 토글 ON → "총 150주 · 매도완료 0주 · 남음 150주" 확인
5. 매도 행: 가격 10700, 수량 150, 메모 "목표가 도달" → 저장 → "✅ 저장 완료!" 토스트, plan이 대기 목록에서 사라짐
6. "내역" 탭에서 확인: 수익금 **+170,000원**, 수익률 **+8.72%**, "2건 분할매도" 표시, 매도건별 줄 두 개(`[1차]`/`[평단]` 태그 + 메모) 표시

- [ ] **Step 2: 시나리오 B — 회귀, 2차 정보 자체가 없는 plan**

종목 추가: 1차 10000원×100주만(2차 입력칸 비움) → 결과 입력 모달 열기.

확인: 토글 자체가 안 보임, "총 100주 · 매도완료 0주 · 남음 100주" 표시, 전량 100주@10500 매도 → "✅ 저장 완료!" 즉시 표시, "내역"에서 수익금 **+50,000원**, 수익률 **+5.00%**, 태그 전혀 안 보임. `docs/superpowers/plans/2026-06-19-sell-tax.md` 적용 직후 상태와 byte-identical해야 함.

- [ ] **Step 3: 시나리오 C — 토글이 이미 ON인 상태로 한 번에 전량 매도(오늘의 흔한 케이스)**

종목 추가: 1차 10000원×100주, 2차 9500원×100주 → 모달 열기 → 토글 즉시 ON → "총 200주 · 매도완료 0주 · 남음 200주" 확인 → 가격 10400, 수량 200(전량) → 저장.

기대값: `avg = (10000*100+9500*100)/200 = 9,750`, `profit = (10400-9750)*200 = 130,000원`, `totalAmt = 1,950,000`, `rate ≈ +6.67%`.

확인: "✅ 저장 완료!" 즉시 표시, "내역"에서 수익금 **+130,000원**, 수익률 **+6.67%**, 매도건 1건이므로 "분할매도" 문구 없음, 매도건별 줄에 `[평단]` 태그(이 plan은 `h.use2===true`). 이전 toggle-only 동작과 숫자가 동일해야 함.

- [ ] **Step 4: 회귀 확인 — "입력" 탭은 영향 없음**

"입력" 탭에서 기존 수동 거래입력 폼이 그대로 동작하는지 확인.

- [ ] **Step 5: `apps-script/Code.gs` 무변경 최종 확인**

```bash
git diff apps-script/Code.gs
```

Expected: 출력 없음.

- [ ] **Step 6: 최종 커밋(필요 시)**

검증 중 문제를 발견해서 수정했다면:

```bash
git add -A
git commit -m "fix: address issues found in staged-sell E2E verification"
```

문제 없었다면 커밋 없이 종료.
