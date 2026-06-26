# 결과 입력 — 익절/손절 시나리오(목표가 티어) 태깅 — Design

## Problem

결과 입력(계획 탭의 결과입력 모달, 입력 탭의 수기 백필) 시 매도가 +3%/+5%/+7% 목표 중 어디까지 도달했는지, 혹은 손절로 끝났는지가 기록되지 않는다. 지금은 "수익(2차분할)" / "손절(1차만)" 처럼 수익 여부와 분할매도 횟수만 남기 때문에, 나중에 "익절을 보통 어느 구간에서 하는지", "목표가까지 못 가고 일찍 정리하는 습관이 있는지" 같은 분석이 불가능하다.

## Goals

- 계획 탭에서 매도를 기록할 때, 각 매도 건이 기준가 대비 어느 수익률 구간(손절/+3%목표부족/+3%/+5%/+7%)에 해당하는지 자동으로 태깅한다.
- 입력 탭에서도 매도가가 입력되면 동일한 기준으로 태깅한다.
- 태그는 사용자가 직접 고르지 않고 가격 데이터로부터 자동 계산된다.
- 한 거래에 매도가 여러 건(분할매도)이면 건별로 각자 태그를 가진다.
- 기존 Google Sheets 컬럼 구조는 바꾸지 않는다 — 기존 텍스트 필드(상태/매도가 컬럼)에 태그 정보를 덧붙이는 방식으로, Apps Script 재배포가 필요 없게 한다.

## Non-Goals

- 사용자가 태그를 수동으로 고르거나 수정하는 UI는 만들지 않는다(자동 계산만).
- 결과입력 모달이나 입력 탭에 입력 중 실시간 미리보기는 추가하지 않는다 — 저장 후 매매내역 화면에서 보이는 것으로 충분하다(사용자 확정).
- 손절가가 커스텀이든 자동(-7%)이든 구분해서 별도 태그를 만들지 않는다 — 수익률 부호(음수=손절)로만 판단하며, 이는 기존 `status` 계산 로직(`profit >= 0 ? '수익' : '손절'`)과 동일한 철학이다.
- Google Sheets에 새 컬럼을 추가하지 않는다(Code.gs 변경 없음).

## Data Model

### 티어 판정 함수

```js
function tierTag(rate) {
  if (rate < 0) return '손절';
  if (rate < 0.03) return '+3%목표부족';
  if (rate < 0.05) return '+3%';
  if (rate < 0.07) return '+5%';
  return '+7%';
}
```

`rate`는 `(매도가 - 기준가) / 기준가`. 1차만 매도된 건은 기준가 = `plan.b1`(계획 탭) 또는 `avg`(입력 탭, use2 미사용 시 `b1`과 동일). 1차+2차가 섞인 평단 매도 건은 기준가 = 블렌드 평균(`phaseInfo(plan, true).base`, 계획 탭) 또는 `avg`(입력 탭, use2 사용 시 블렌드 평균).

등급 순서(낮음→높음): `손절 < +3%목표부족 < +3% < +5% < +7%`. 여러 매도 건의 "최고 도달 등급"을 구할 때 이 순서로 비교한다.

### 계획 탭 — 매도 객체에 `tag` 필드 추가

기존 `plan.sells` 항목 `{price, qty, date, tax, phase, memo}`에 `tag` 필드를 추가: `{price, qty, date, tax, phase, memo, tag}`.

`saveResult()`에서 매도 행을 만들 때 이미 계산되어 있는 `phaseInfo(plan, modalUse2).base`를 기준가로 써서 그 자리에서 계산해 붙인다. 이렇게 하면:
- 부분매도(아직 finalize 안 된 상태)도 Plans 시트의 `sells_json`에 태그가 같이 저장되어, 새로고침/재방문해도 유지된다.
- `finalizePlan()`은 이미 태그가 붙은 `plan.sells`를 그대로 쓰면 되고, 원본 phase별 기준가를 다시 계산할 필요가 없다.

### 입력 탭 — 단일 매도값에 태그 계산

입력 탭은 매도 건이 하나뿐이라 별도 필드 구조가 필요 없다. `saveTrade()`에서 `sell > 0`(매도가가 입력됨, 즉 "보유중"이 아님)일 때만, 이미 row 배열을 만들 때 쓰는 것과 같은 수식 `(sell - avg) / avg`로 구한 rate를 `tierTag(rate)`에 넘겨 문자열로 활용한다.

## 적용 로직

### 계획 탭

1. `saveResult()`: `rows` 배열을 만들 때 각 행에 `tag: tierTag((price - info.base) / info.base)` 추가.
2. `finalizePlan()`: `plan.sells`(태그 포함)에서 등급 순서 기준 최고 등급을 찾아 `bestTag`로 저장. 기존 `status` 문자열에 ` · 최고 ${bestTag}`를 덧붙인다(예: `수익(2차분할) · 최고 +7%`). 메인 시트 row의 `sellPriceCol`도 각 항목에 태그를 인라인으로 덧붙인다 — `${s.price}(${s.qty}주)` → `${s.price}(${s.qty}주)[${s.tag}]`.

```js
const TIER_RANK = ['손절', '+3%목표부족', '+3%', '+5%', '+7%'];
const bestTag = plan.sells.reduce((best, s) =>
  TIER_RANK.indexOf(s.tag) > TIER_RANK.indexOf(best) ? s.tag : best,
  plan.sells[0].tag);
```
3. `hist`(localStorage) 객체의 `sells` 배열도 태그가 붙은 `plan.sells` 그대로 저장되므로 추가 작업 불필요.

### 입력 탭

`saveTrade()`에서 `sell > 0`이면 `document.getElementById('tradeStatus').value`에 ` · ${tierTag(rate)}`를 덧붙인 문자열을 row의 상태 컬럼에 쓴다. `sell`이 없으면(보유중) 기존 그대로 `tradeStatus` 값만 쓴다.

## Sheets Export / 연동

**변경 없음** — 두 경로 모두 기존 컬럼 개수/위치 그대로(계획 탭 31열, 입력 탭 30열), 상태 컬럼(0-indexed 22, 양쪽 동일 위치)과 매도가 컬럼(계획 탭만 해당, 0-indexed 18) 안의 **텍스트 포맷만** 풍부해진다. Code.gs 수정이나 재배포가 필요 없다.

## UI

매매내역 탭(`renderHistory()`)의 매도 줄 표시를 확장:

```js
const sellLines = (h.sells || []).map(s => {
  const tag = h.use2 ? (...) : '';
  const tagBadge = s.tag ? ` <span style="color:var(--accent);">[${s.tag}]</span>` : '';
  const memo = s.memo ? ` — ${s.memo}` : '';
  return `<div class="hist-meta">${s.date} · ${(s.price||0).toLocaleString('ko-KR')}원 × ${s.qty}주${tag}${tagBadge}${memo}</div>`;
}).join('');
```

`s.tag`가 없는(레거시) 매도 기록은 태그 배지를 표시하지 않고 그대로 보여준다(에러 없음).

## Backward Compatibility

- 기존 `plan.sells` / `hist.sells` 항목에는 `tag` 필드가 없다(`undefined`) → 화면에서 태그 배지를 표시하지 않을 뿐, 에러 없이 정상 렌더링된다.
- 기존 Google Sheets에 이미 쓰인 상태/매도가 컬럼 텍스트는 그대로 유지된다(과거 row를 다시 쓰지 않음) — 앞으로 저장되는 새 row부터만 태그가 포함된 포맷으로 기록된다.
