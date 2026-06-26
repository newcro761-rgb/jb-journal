# 매매내역 수정 + 예수금 기반 수익률 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매매내역 탭에서 거래(종목명/종목코드/매도 내역)를 수정할 수 있게 하고, 예수금을 입력하면 "평균 수익률" 대신 "자본 기준 수익률"(총 수익금/예수금)을 보여준다.

**Architecture:** `index.html` 단일 파일 내 변경만으로 구현한다. 예수금은 `localStorage`(`jb-capital`)에 저장되는 단일 숫자값이고, 수정은 기존 결과입력 모달과 별개의 새 모달(`edit-modal`)로 구현해서 매도 row를 고치고 저장 시 `profit`/`rate`/`status`/`tag`를 자동 재계산한다. Google Sheets와 Apps Script(`Code.gs`)는 전혀 건드리지 않는다 — 이 수정은 `localStorage`(`jb-history`)에만 반영된다.

**Tech Stack:** Vanilla HTML5/CSS3/JS, localStorage, GitHub Pages. 새 npm 패키지나 빌드 도구 없음.

## Global Constraints

- 매수 정보(`avg`, `totalQty`, `use2`, 매수일)와 장세(`regime`)는 수정 대상이 아니다 — 종목명/종목코드와 매도 row(가격/수량/날짜/세금/메모)만 수정 가능(설계 문서 Non-Goals).
- 재계산 기준가는 항상 `h.avg`(이미 저장된 합산 평단가) 하나만 쓴다. 1차+2차 혼합 거래도 원래의 개별 기준가(b1/블렌드 평균)를 복원하지 않고 `avg`로 통일한다(사용자 확정, 약간의 근사 발생 가능, 의도된 동작).
- `tierTag(rate)`/`TIER_RANK`(이미 존재하는 전역 함수/상수)를 그대로 재사용한다 — 새로 등급 로직을 만들지 않는다.
- 매도 row가 0개인 채로는 저장할 수 없다(결과입력 모달의 기존 검증 철학과 동일).
- Google Sheets 컬럼/스키마, `Code.gs`는 전혀 건드리지 않는다. 이 기능은 `localStorage`만 갱신한다.
- 예수금이 설정 안 됨(빈 값 또는 0)이면 기존처럼 "평균 수익률"(거래별 rate 단순 평균)을 그대로 보여준다.
- 설계 문서: `docs/superpowers/specs/2026-06-26-history-edit-capital-design.md`.

---

### Task 1: 예수금 입력 + 자본 기준 수익률

**Files:**
- Modify: `jb-journal/index.html:369-379` (탭3 HTML, 예수금 입력 필드 추가)
- Modify: `jb-journal/index.html:953-955` (`saveCapital()` 추가)
- Modify: `jb-journal/index.html:957-977` (`renderHistory()`, 통계 계산부)

**Interfaces:**
- Produces: `localStorage` 키 `jb-capital`(문자열로 저장된 숫자), `function saveCapital()`.

- [ ] **Step 1: 예수금 입력 필드 HTML 추가**

다음을 찾아:

```html
  <!-- ======== 탭3: 매매내역 ======== -->
  <div id="tab-history" class="tab-content">
    <div class="page-title">매매내역</div>

    <div class="stat-grid" id="stat-grid"></div>

    <div class="section" style="padding:10px 14px;">
      <div class="section-title">최근 거래</div>
      <div id="hist-list"></div>
    </div>
  </div>
```

아래로 교체:

```html
  <!-- ======== 탭3: 매매내역 ======== -->
  <div id="tab-history" class="tab-content">
    <div class="page-title">매매내역</div>

    <div class="section" style="padding:10px 14px;">
      <label>예수금(원)</label>
      <input type="number" id="capitalInput" placeholder="10000000" oninput="saveCapital()">
    </div>

    <div class="stat-grid" id="stat-grid"></div>

    <div class="section" style="padding:10px 14px;">
      <div class="section-title">최근 거래</div>
      <div id="hist-list"></div>
    </div>
  </div>
```

- [ ] **Step 2: `saveCapital()` 함수 추가**

다음을 찾아:

```js
  function loadHistory() { return JSON.parse(localStorage.getItem('jb-history')||'[]'); }
  function saveHistory(h) { localStorage.setItem('jb-history', JSON.stringify(h)); }
  function deleteHistory(id) { saveHistory(loadHistory().filter(h=>h.id!==id)); renderHistory(); }
```

아래로 교체:

```js
  function loadHistory() { return JSON.parse(localStorage.getItem('jb-history')||'[]'); }
  function saveHistory(h) { localStorage.setItem('jb-history', JSON.stringify(h)); }
  function deleteHistory(id) { saveHistory(loadHistory().filter(h=>h.id!==id)); renderHistory(); }
  function saveCapital() {
    localStorage.setItem('jb-capital', document.getElementById('capitalInput').value);
    renderHistory();
  }
```

- [ ] **Step 3: `renderHistory()`에서 예수금 읽어와 입력칸 채우고, 통계 카드 라벨/값 교체**

다음을 찾아:

```js
  function renderHistory() {
    const hist = loadHistory();
    const grid = document.getElementById('stat-grid');
    const list = document.getElementById('hist-list');

    if (!hist.length) {
      grid.innerHTML = '';
      list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px 0;">아직 기록이 없습니다.</div>';
      return;
    }

    const total = hist.reduce((s,h)=>s+h.profit, 0);
    const wins  = hist.filter(h=>h.profit>0).length;
    const rate  = (wins/hist.length*100).toFixed(0);
    const avgR  = (hist.reduce((s,h)=>s+h.rate,0)/hist.length*100).toFixed(2);

    grid.innerHTML = `
      <div class="stat-card"><div class="stat-label">총 수익금</div><div class="stat-val ${total>=0?'green':'red'}">${total>=0?'+':''}${total.toLocaleString('ko-KR')}원</div></div>
      <div class="stat-card"><div class="stat-label">승률</div><div class="stat-val ${wins/hist.length>=0.5?'green':'red'}">${rate}%</div></div>
      <div class="stat-card"><div class="stat-label">거래 수</div><div class="stat-val">${hist.length}건</div></div>
      <div class="stat-card"><div class="stat-label">평균 수익률</div><div class="stat-val ${avgR>=0?'green':'red'}">${avgR>=0?'+':''}${avgR}%</div></div>`;
```

아래로 교체:

```js
  function renderHistory() {
    const capEl = document.getElementById('capitalInput');
    if (capEl) capEl.value = localStorage.getItem('jb-capital') || '';

    const hist = loadHistory();
    const grid = document.getElementById('stat-grid');
    const list = document.getElementById('hist-list');

    if (!hist.length) {
      grid.innerHTML = '';
      list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px 0;">아직 기록이 없습니다.</div>';
      return;
    }

    const total = hist.reduce((s,h)=>s+h.profit, 0);
    const wins  = hist.filter(h=>h.profit>0).length;
    const rate  = (wins/hist.length*100).toFixed(0);
    const avgR  = (hist.reduce((s,h)=>s+h.rate,0)/hist.length*100).toFixed(2);
    const capital = parseFloat(localStorage.getItem('jb-capital')) || 0;
    const capRate = capital > 0 ? (total / capital * 100).toFixed(2) : null;
    const rateLabel = capital > 0 ? '자본 기준 수익률' : '평균 수익률';
    const rateVal = capital > 0 ? capRate : avgR;

    grid.innerHTML = `
      <div class="stat-card"><div class="stat-label">총 수익금</div><div class="stat-val ${total>=0?'green':'red'}">${total>=0?'+':''}${total.toLocaleString('ko-KR')}원</div></div>
      <div class="stat-card"><div class="stat-label">승률</div><div class="stat-val ${wins/hist.length>=0.5?'green':'red'}">${rate}%</div></div>
      <div class="stat-card"><div class="stat-label">거래 수</div><div class="stat-val">${hist.length}건</div></div>
      <div class="stat-card"><div class="stat-label">${rateLabel}</div><div class="stat-val ${rateVal>=0?'green':'red'}">${rateVal>=0?'+':''}${rateVal}%</div></div>`;
```

- [ ] **Step 4: 브라우저에서 확인**

`index.html`을 브라우저에서 열고 "매매내역" 탭으로 이동(거래 기록이 1건 이상 있어야 함 — 없으면 개발자 도구 콘솔에서 아래로 하나 추가):

```js
const h = JSON.parse(localStorage.getItem('jb-history')) || [];
h.push({id: 1, date: '2026-06-01', name: '테스트', code: '000001', status: '수익(1차분할) · 최고 +5%', avg: 10000, sells: [{price: 10500, qty: 10, date: '2026-06-01', tax: 0, phase: 1, memo: '', tag: '+5%'}], totalQty: 10, profit: 5000, rate: 0.05, tax: 0, use2: false, regime: null});
localStorage.setItem('jb-history', JSON.stringify(h));
```

페이지를 새로고침하고 "매매내역" 탭을 열어, "평균 수익률" 카드가 보이는지 확인. 예수금 입력칸에 `1000000`을 입력 — 카드 라벨이 "자본 기준 수익률"로 바뀌고 값이 `5,000/1,000,000*100 = 0.50%`로 표시되는지 확인. 예수금 입력칸을 지우면 다시 "평균 수익률"로 돌아오는지 확인.

Expected: 예수금 입력 전 "평균 수익률" 표시, 입력 후 "자본 기준 수익률"로 라벨/값 모두 교체, 지우면 원복.

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: add capital input and capital-based return rate"
```

---

### Task 2: 매매내역 수정 모달 — 마크업 + 열기/닫기/행 추가삭제

**Files:**
- Modify: `jb-journal/index.html:160` (CSS, `.hist-edit` 버튼 스타일 추가)
- Modify: `jb-journal/index.html:413-415` (결과입력 모달 바로 뒤에 `edit-modal` 마크업 추가)
- Modify: `jb-journal/index.html:446` (상태 선언부, `editHistId` 추가)
- Modify: `jb-journal/index.html:753-756` (`closeModal()` 바로 뒤에 모달 제어 함수들 추가)
- Modify: `jb-journal/index.html:999` (`renderHistory()`, hist-item에 "✎" 버튼 추가)
- Modify: `jb-journal/index.html:1018-1021` (모달 오버레이 클릭 시 닫기 리스너 추가)

**Interfaces:**
- Consumes: `tierTag`(이번 태스크에서는 쓰지 않음, Task 3에서 사용), `loadHistory()`.
- Produces: `let editHistId`, `function openEditModal(id)`, `function addEditSellRow(data)`, `function removeEditSellRow(btn)`, `function closeEditModal()`. `data` 매개변수는 `{price, qty, date, tax, phase, memo}` 형태(생략 시 빈 row, phase는 1로 기본 설정). Task 3이 `saveEditedHistory()`에서 `editHistId`와 `#edit-sell-rows .sell-row`(각 row의 `dataset.phase`, `.sr-price/.sr-qty/.sr-date/.sr-tax/.sr-memo` 입력값)를 읽는다.
- 참고: 기존 결과입력 모달의 `addSellRow()`는 최대 3행으로 제한되어 있지만(`계획 탭에서 동시에 가능한 매도 단계 수`에 묶인 제약), `addEditSellRow()`는 의도적으로 그 상한을 두지 않는다 — 과거 기록을 고치는 용도라 행 개수를 인위적으로 제한할 이유가 없다. 이건 `addSellRow()`와의 누락이 아니라 의도된 차이다.

- [ ] **Step 1: `.hist-edit` CSS 추가**

다음을 찾아:

```css
    .hist-del { background: none; border: none; color: var(--muted); font-size: 16px; cursor: pointer; padding: 4px; margin-left: 10px; }
```

아래로 교체:

```css
    .hist-del { background: none; border: none; color: var(--muted); font-size: 16px; cursor: pointer; padding: 4px; margin-left: 10px; }
    .hist-edit { background: none; border: none; color: var(--muted); font-size: 16px; cursor: pointer; padding: 4px; margin-left: 6px; }
```

- [ ] **Step 2: 수정 모달 마크업 추가**

다음을 찾아:

```html
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeModal()">취소</button>
      <button class="modal-save" onclick="saveResult()">저장하기</button>
    </div>
  </div>
</div>

<!-- 하단 탭바 -->
```

아래로 교체:

```html
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeModal()">취소</button>
      <button class="modal-save" onclick="saveResult()">저장하기</button>
    </div>
  </div>
</div>

<!-- 매매내역 수정 모달 -->
<div class="modal-overlay" id="edit-modal">
  <div class="modal-box">
    <div class="modal-title">거래 수정</div>
    <label>종목명</label><input type="text" id="edit-name">
    <label>종목코드</label><input type="text" id="edit-code">
    <div id="edit-sell-rows"></div>
    <button type="button" class="add-row-btn" onclick="addEditSellRow()">+ 매도 추가</button>
    <div class="modal-actions">
      <button class="modal-cancel" onclick="closeEditModal()">취소</button>
      <button class="modal-save" onclick="saveEditedHistory()">저장하기</button>
    </div>
  </div>
</div>

<!-- 하단 탭바 -->
```

(주의: `saveEditedHistory()` 함수는 Task 3에서 추가된다. 이 태스크가 끝난 시점에 "저장하기" 버튼을 누르면 콘솔에 ReferenceError가 나는 게 정상이다 — 이번 태스크 검증에서는 누르지 말 것.)

- [ ] **Step 3: 상태 변수 `editHistId` 추가**

다음을 찾아:

```js
  let entryRegime = null;    // "입력" 탭에서 선택한 장세
```

아래로 교체:

```js
  let entryRegime = null;    // "입력" 탭에서 선택한 장세
  let editHistId = null;     // 현재 매매내역 수정 모달에 열린 history id
```

- [ ] **Step 4: 모달 열기/닫기/행 추가삭제 함수 추가**

다음을 찾아:

```js
  function closeModal() {
    document.getElementById('result-modal').classList.remove('show');
    modalPlanId = null;
  }

  function saveResult() {
```

아래로 교체:

```js
  function closeModal() {
    document.getElementById('result-modal').classList.remove('show');
    modalPlanId = null;
  }

  function openEditModal(id) {
    const hist = loadHistory();
    const h = hist.find(x => x.id === id);
    if (!h) return;
    editHistId = id;
    document.getElementById('edit-name').value = h.name || '';
    document.getElementById('edit-code').value = h.code || '';
    document.getElementById('edit-sell-rows').innerHTML = '';
    (h.sells || []).forEach(s => addEditSellRow(s));
    document.getElementById('edit-modal').classList.add('show');
  }

  function addEditSellRow(data) {
    const wrap = document.getElementById('edit-sell-rows');
    const div = document.createElement('div');
    div.className = 'sell-row';
    div.dataset.phase = data && data.phase ? data.phase : 1;
    div.innerHTML = `
      <div class="row2">
        <div><label>매도가</label><input type="number" class="sr-price" placeholder="10300" value="${data ? data.price : ''}"></div>
        <div><label>수량</label><input type="number" class="sr-qty" placeholder="50" value="${data ? data.qty : ''}"></div>
      </div>
      <div class="row2" style="margin-top:8px;">
        <div><label>매도일</label><input type="date" class="sr-date" value="${data ? data.date : new Date().toISOString().split('T')[0]}"></div>
        <div><label>세금 (원, 선택)</label><input type="number" class="sr-tax" placeholder="0" value="${data && data.tax ? data.tax : ''}"></div>
      </div>
      <div style="margin-top:8px;">
        <label>메모 (선택)</label><input type="text" class="sr-memo" placeholder="예: 반등 약해서 일부 정리" value="${data && data.memo ? data.memo : ''}">
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button type="button" class="sr-del" onclick="removeEditSellRow(this)">✕ 삭제</button>
      </div>`;
    wrap.appendChild(div);
  }

  function removeEditSellRow(btn) {
    const wrap = document.getElementById('edit-sell-rows');
    if (wrap.querySelectorAll('.sell-row').length <= 1) return;
    btn.closest('.sell-row').remove();
  }

  function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('show');
    editHistId = null;
  }

  function saveResult() {
```

- [ ] **Step 5: "✎" 수정 버튼을 매매내역 항목에 추가**

다음을 찾아:

```js
        <button class="hist-del" onclick="deleteHistory(${h.id})">✕</button>
      </div>`;
```

아래로 교체:

```js
        <button class="hist-edit" onclick="openEditModal(${h.id})">✎</button>
        <button class="hist-del" onclick="deleteHistory(${h.id})">✕</button>
      </div>`;
```

- [ ] **Step 6: 모달 바깥 클릭 시 닫히게 리스너 추가**

다음을 찾아:

```js
  // 모달 오버레이 클릭 시 닫기
  document.getElementById('result-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
```

아래로 교체:

```js
  // 모달 오버레이 클릭 시 닫기
  document.getElementById('result-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.getElementById('edit-modal').addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
  });
```

- [ ] **Step 7: 브라우저에서 확인**

`index.html`을 브라우저에서 열고(Task 1의 Step 4에서 추가한 테스트 거래가 남아있다고 가정), "매매내역" 탭에서 "✎" 버튼 클릭 → 모달이 열리고 종목명("테스트")/종목코드("000001")/매도가(10500)/수량(10)/매도일(2026-06-01)이 미리 채워져 있는지 확인. "+ 매도 추가"를 눌러 row가 하나 더 생기는지, 그 row의 "✕ 삭제"를 누르면 다시 사라지는지 확인. 마지막 남은 1개 row는 삭제 버튼을 눌러도 사라지지 않는지 확인(`removeEditSellRow`의 최소 1개 유지 로직). "취소"를 누르면 모달이 닫히는지 확인. **"저장하기"는 누르지 말 것**(Task 3에서 구현).

Expected: 모달이 기존 데이터로 정확히 채워짐, 행 추가/삭제 동작, 최소 1행 유지, 취소 시 정상 닫힘.

- [ ] **Step 8: 커밋**

```bash
git add index.html
git commit -m "feat: add history edit modal markup and open/close/row controls"
```

---

### Task 3: 수정 내용 저장 및 재계산

**Files:**
- Modify: `jb-journal/index.html` (Task 2가 추가한 `closeEditModal()` 바로 뒤에 `saveEditedHistory()` 추가)

**Interfaces:**
- Consumes: `tierTag(rate)`, `TIER_RANK`(둘 다 기존 전역), `editHistId`, `loadHistory()`, `saveHistory(h)`, `closeEditModal()`, `renderHistory()`, `showToast(msg)`(기존 전역 함수, 이미 다른 곳에서 사용 중).
- Produces: `function saveEditedHistory()` — `#edit-modal`의 "저장하기" 버튼이 이미 Task 2에서 이 이름으로 연결되어 있다.

- [ ] **Step 1: `saveEditedHistory()` 구현**

다음을 찾아:

```js
  function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('show');
    editHistId = null;
  }

  function saveResult() {
```

아래로 교체:

```js
  function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('show');
    editHistId = null;
  }

  function saveEditedHistory() {
    const hist = loadHistory();
    const h = hist.find(x => x.id === editHistId);
    if (!h) return;

    const sells = Array.from(document.querySelectorAll('#edit-sell-rows .sell-row')).map(row => {
      const price = parseFloat(row.querySelector('.sr-price').value) || 0;
      return {
        price,
        qty: parseFloat(row.querySelector('.sr-qty').value) || 0,
        date: row.querySelector('.sr-date').value,
        tax: parseFloat(row.querySelector('.sr-tax').value) || 0,
        phase: parseInt(row.dataset.phase, 10) || 1,
        memo: row.querySelector('.sr-memo').value.trim(),
        tag: tierTag((price - h.avg) / h.avg)
      };
    }).filter(r => r.price > 0 && r.qty > 0 && r.date);

    if (!sells.length) { showToast('매도가/수량/매도일을 입력하세요.'); return; }

    const totalTax = sells.reduce((s, x) => s + (x.tax || 0), 0);
    const totalQty = sells.reduce((s, x) => s + x.qty, 0);
    const profit = Math.round(sells.reduce((s, x) => s + (x.price - h.avg) * x.qty, 0) - totalTax);
    const rate = parseFloat((profit / (h.avg * totalQty)).toFixed(4));
    const bestTag = sells.reduce((best, s) =>
      TIER_RANK.indexOf(s.tag) > TIER_RANK.indexOf(best) ? s.tag : best,
      sells[0].tag);
    const status = (profit >= 0 ? '수익' : '손절') + `(${sells.length}차분할) · 최고 ${bestTag}`;

    h.name = document.getElementById('edit-name').value;
    h.code = document.getElementById('edit-code').value;
    h.sells = sells;
    h.totalQty = totalQty;
    h.profit = profit;
    h.rate = rate;
    h.tax = totalTax;
    h.status = status;

    saveHistory(hist);
    closeEditModal();
    renderHistory();
    showToast('✅ 수정 완료!');
  }

  function saveResult() {
```

- [ ] **Step 2: 브라우저에서 전체 흐름 확인**

`index.html`을 브라우저에서 열고(Task 1/2에서 쓴 테스트 거래가 있다는 가정), "매매내역" 탭에서 "✎" 클릭 → 매도가를 10500에서 10700으로 수정 → "저장하기" 클릭. "✅ 수정 완료!" 토스트가 뜨는지, 목록의 해당 거래 수익금/수익률이 갱신되는지(10000 기준가 대비 10700 = +7%, 수량 10이면 수익 7000원, 세금 0이면 그대로) 확인. 매도 줄의 태그 배지가 `[+5%]`에서 `[+7%]`로 바뀌는지도 확인. 개발자 도구 콘솔에서:

```js
JSON.parse(localStorage.getItem('jb-history'))[0]
```

를 실행해 `profit === 7000`, `rate === 0.07`, `status`에 `· 최고 +7%`가 포함되는지 확인. 확인 후 콘솔에서 테스트 데이터 정리:

```js
const h2 = JSON.parse(localStorage.getItem('jb-history')).filter(x => x.id !== 1);
localStorage.setItem('jb-history', JSON.stringify(h2));
```

Expected: 수정 후 `profit=7000`, `rate=0.07`, `status`에 `· 최고 +7%` 포함, 화면에도 동일하게 반영.

- [ ] **Step 3: 커밋**

```bash
git add index.html
git commit -m "feat: implement history edit save with profit/rate/status recompute"
```
