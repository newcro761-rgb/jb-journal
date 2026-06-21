# 1차/2차 단계별 매도 + 매도 메모 — Design

## Problem

지금은 결과 입력 모달의 "2차 매수 실제 체결" 토글이 **첫 매도를 저장하기 전에만** 켜고 끌 수 있고, 그 이후엔 plan 전체에 고정된다(`docs/superpowers/plans/2026-06-18-partial-sell.md`, `docs/superpowers/plans/2026-06-19-sell-tax.md` 위에 쌓인 기존 동작). 그런데 실제 매매에서는 이런 흐름이 자주 나온다:

1. 1차만 매수한 상태에서 일부 물량을 먼저 매도(1차 단가 기준 수익 계산)
2. 그 다음에 2차 매수를 진행 → 남은 1차 물량과 2차 물량이 합쳐져 평단가가 새로 계산됨
3. 그 다음에 남은 물량을 평단가 기준으로 매도

오늘의 토글은 이 흐름을 표현할 수 없다 — 첫 매도 전에 "2차 했음/안 했음"을 한 번만 정하고 끝이라, 위 시나리오의 1번과 3번이 서로 다른 단가 기준을 써야 한다는 걸 반영하지 못한다.

추가로, 매도건마다 간단한 메모(왜 팔았는지)를 남겨서 나중에 매매내역에서 복기할 수 있게 하고 싶다.

## Goals

- 같은 종목(plan) 안에서, "1차 단가 기준 매도" → "2차 매수로 평단가 전환" → "평단가 기준 매도"가 자연스럽게 이어지도록 한다.
- 전환은 자동(사용자가 토글을 켜는 시점에 1회 계산되어 고정)이며, 켜진 후에는 되돌릴 수 없다.
- 2차 매수를 끝까지 안 하는 케이스(기존 단순 케이스)는 동작·계산 결과가 기존과 100% 동일해야 한다(회귀 없음).
- 매도건마다 자유 텍스트 메모를 남길 수 있고, 매매내역에서 매도건별로(날짜·가격·수량·기준·메모) 확인할 수 있다.

## Non-Goals

- 3차 이상 분할 매수는 다루지 않는다(기존처럼 1차/2차 2단계까지만).
- 메모에 대한 글자 수 제한, 검색/필터링 UI는 만들지 않는다.
- "입력" 탭의 수동 거래입력 폼은 건드리지 않는다(기존 제약 유지).

## Data Model

`plan` 객체에 필드 추가:

- `phase2Pool` (number, optional) — `use2`가 처음 `true`로 켜지는 시점에 1회 계산해서 저장. `remainingQ1 + q2`, 여기서 `remainingQ1 = q1 - (그 시점까지 저장된 phase:1 매도 수량 합)`.
- `phase2Avg` (number, optional) — 같은 시점에 1회 계산. `(b1*remainingQ1 + b2*q2) / (remainingQ1+q2)`.

`plan.sells[]`의 각 항목에 필드 추가:

- `phase` (1 | 2) — 그 매도행을 저장하던 시점의 토글 상태로 자동 태깅. 1=1차 단가 기준, 2=평단가(`phase2Avg`) 기준.
- `memo` (string, optional) — 자유 텍스트, 빈 문자열이면 표시 안 함.

`plan.use2`는 기존처럼 한 번 `true`가 되면 영구 고정(되돌릴 수 없음) — 의미만 "전체 plan 단위로 한 번 결정"에서 "지금까지의 1차 단가 매도 구간이 끝나고 평단가 구간으로 전환됐다"로 바뀐다.

레거시 데이터(`sells[].phase`가 `undefined`인 기존 기록)는 `phase 1`(=`b1` 기준)으로 취급한다 — 이 필드가 생기기 전 모든 기록은 1차/2차 구분 없이 단일 `avg` 기준으로 계산됐었으므로, 화면 표시에서 에러 없이 그대로 보여야 한다(태그 없이 표시).

`finalizePlan()`이 만드는 매매내역(`hist`) 항목에도 `use2`(boolean, `plan.use2`를 그대로 복사) 필드를 추가한다 — History Display 섹션에서 "2차를 아예 안 쓴 plan은 단계 태그를 안 보여준다"를 판단하려면 history 항목 자체가 이 값을 알아야 한다(기존 `hist.unshift()`에는 이 필드가 없었음).

## Modal UI

**토글 노출 조건 변경:** 지금은 `hasB2 && plan.sells.length === 0`일 때만 토글이 보임 → `hasB2 && plan.use2 !== true`로 변경. 즉 1차 단가로 부분매도를 몇 번을 저장해도(`use2`가 아직 `true`가 안 됐으므로) 토글은 계속 보이고, 평단가로 전환(`use2 = true`)된 이후에만 영구히 사라진다.

**저장 시 분기 (`saveResult()`):**
- 토글이 OFF(`modalUse2 === false`)인 상태로 저장 → 이번 배치의 행들은 `phase: 1`. 매도 가능 수량 = `q1 - (지금까지 phase1 매도 수량 합)`.
- 토글이 ON인 상태로 저장, 그리고 `plan.phase2Pool`이 아직 없음(=이번이 첫 전환) → 전환 시점 기준으로 `phase2Pool`/`phase2Avg`를 계산해 plan에 저장한 뒤, 이번 배치의 행들은 `phase: 2`. 매도 가능 수량 = `phase2Pool - 0`(아직 phase2 매도 없음).
- 토글이 ON이고 `plan.phase2Pool`이 이미 있음(=전에 전환했고, 지금은 평단가 단계에서 추가 부분매도 중) → 이번 배치도 `phase: 2`. 매도 가능 수량 = `phase2Pool - (지금까지 phase2 매도 수량 합)`.
- `hasB2`가 false(2차 자체가 plan에 없는 단순 케이스) → 토글 자체가 안 보이고, 항상 `phase: 1`, 매도 가능 수량 = `q1 - phase1 매도 합` — 기존 동작과 동일.

**매도행 입력칸:** 기존 매도가/수량/매도일/세금에 "메모 (선택)" 텍스트 입력 한 칸 추가.

## Calculation (`finalizePlan`)

```
phase1Sells = plan.sells.filter(s => (s.phase||1) === 1)
phase2Sells = plan.sells.filter(s => s.phase === 2)

profit = round(
  sum(phase1Sells, (price-b1)*qty) +
  sum(phase2Sells, (price-plan.phase2Avg)*qty) -
  totalTax
)

totalAmt = b1*q1 + (plan.use2 ? b2*q2 : 0)   // 기존과 동일한 정의
rate = profit / totalAmt
```

`rate`를 `avg*totalQty`가 아니라 `totalAmt`로 나누는 것으로 식을 바꾸지만, `avg*totalQty`는 정의상 항상 `totalAmt`와 같은 값이었으므로 2차를 안 한 기존 케이스는 결과값이 완전히 동일하다(회귀 없음). 2차를 한 케이스도, phase1/phase2 합산 profit이 곧 "전체 매도금 − 전체 투입금 − 세금"과 같으므로 결과는 동일하게 나온다(수학적 동치, 기존 sell-tax 계획의 Task 4에서 검증한 동치 관계와 같은 종류).

## History Display

매매내역 카드의 `hist-meta` 줄(`날짜 · 상태 · n건 분할매도`) 아래에, 매도건별 줄을 추가:

```
2026-06-10 · 10,300원 × 50주 [1차] — 반등 약해서 일부 정리
2026-06-15 · 10,700원 × 50주 [평단] — 목표가 도달
```

- `[1차]`/`[평단]` 태그는 `s.phase`가 2일 때만 "[평단]"으로, 그 외(1 또는 undefined=레거시)는 "[1차]"로 표시. 단, 그 plan이 2차를 아예 안 쓴 경우(`h.use2`가 한 번도 true가 안 됨)는 태그 자체를 안 보여준다(단계 구분이 의미 없으므로).
- 메모(`s.memo`)가 있으면 ` — 메모내용` 형태로 같은 줄에 붙인다. 없으면 생략.

## Sheets Export

`finalizePlan()`의 31열 row 배열 중 현재 빈 문자열로 채워진 trailing 칸(인덱스 23, `docs/superpowers/specs/2026-06-19-sell-tax-design.md`가 만든 21번 세금 칸 바로 다음 비는 칸)에, 매도건별 메모를 `sellPriceCol`과 같은 패턴으로 합쳐서 채운다:

```
memoCol = plan.sells.filter(s=>s.memo).map(s => `${s.date}: ${s.memo}`).join(' / ')
```

메모가 없는 매도건은 건너뛴다. 열 개수/순서는 변하지 않는다(여전히 31개).

## Backward Compatibility

- `plan.use2`가 `undefined`(2차 정보 자체가 없는 plan)인 기존 plan: 전부 동일하게 동작.
- `sells[].phase`가 없는 기존 기록: `1`로 취급, 화면에 태그 안 보임(2차를 안 쓴 케이스와 동일하게 처리됨).
- `sells[].memo`가 없는 기존 기록: 화면에 메모 줄 자체가 안 보임.
