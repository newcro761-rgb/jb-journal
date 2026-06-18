# 결과 입력 모달 — 매도 차수별 세금 입력 설계 문서

**날짜:** 2026-06-19
**대상 파일:** `jb-journal/index.html` (결과 입력 모달, `saveResult()`/`finalizePlan()`, 매매내역, Sheets row)

---

## 1. 배경 / 목표

분할매도(1~3차) 기능에 매도 시 발생하는 세금(거래세 등)을 반영해달라는 요청. 세금은 PnL(수익금)에서 빠져야 한다. 이번 변경도 직전 분할매도 기능(`docs/superpowers/specs/2026-06-18-partial-sell-design.md`)과 동일하게 **결과 입력 모달에만** 적용하고, "입력" 탭 수동 거래입력 폼은 건드리지 않는다.

---

## 2. 입력 UI 변경

각 `.sell-row`(매도가/수량/매도일)에 **세금(원, 선택)** 입력칸을 추가한다. 비워두면 0으로 처리한다.

행 레이아웃 재구성:
- 1번째 줄(`row2`): 매도가 / 수량 — 기존과 동일
- 2번째 줄(`row2`): 매도일 / **세금(신규)** — 기존에 매도일과 같은 줄에 있던 삭제 버튼을 아래로 옮긴다
- 3번째 줄: 삭제 버튼만 우측 정렬로 단독 배치

저장 시 행 파싱: `tax: parseFloat(row.querySelector('.sr-tax').value) || 0`. 유효 행 판정 조건(`price > 0 && qty > 0 && date`)에는 세금을 포함하지 않는다(세금 0도 유효한 입력).

---

## 3. 계산 변경 (`finalizePlan`)

```js
const totalTax = plan.sells.reduce((s, x) => s + (x.tax || 0), 0);
const profit = Math.round(soldAmt - avg*totalQty - totalTax);   // 기존 식에서 totalTax만 추가로 차감
const rate = parseFloat((profit / (avg*totalQty)).toFixed(4));  // 세후 순수익 기준으로 재정의
```

- `totalTax`는 이번 저장뿐 아니라 **이전 세션에서 이미 저장된 `plan.sells`까지 전부 합산**한다(soldAmt와 동일한 범위).
- `rate`는 기존에는 `(soldAmt/totalQty - avg) / avg`(세전 가격 기준)였으나, 세금을 반영한 화면상의 수익금(`profit`)과 수익률이 서로 일치하도록 `profit / (avg*totalQty)`로 정의를 바꾼다. 즉 화면에 보이는 수익금과 수익률은 항상 세후 기준으로 통일된다.
- `status`(수익/손절 판정)는 변경 없이 `profit >= 0` 기준 그대로 사용 — 자연히 세후 기준으로 판정된다.

---

## 4. 매매내역(History) 표시 변경

`hist` 항목에 `tax`(이번 거래의 totalTax) 필드를 추가 저장한다:

```js
hist.unshift({
  id, date, name, code, status, avg, sells, totalQty, profit, rate,
  tax: totalTax   // 신규
});
```

`renderHistory()`의 `hist-right` 블록에, `tax > 0`일 때만 수익률 아래에 별도 줄을 추가:

```html
${h.tax > 0 ? `<div class="hist-tax">세금 -${h.tax.toLocaleString('ko-KR')}원</div>` : ''}
```

레거시 항목(`h.tax`가 `undefined`)은 `h.tax > 0`이 `false`가 되어 안전하게 줄이 생략된다.

---

## 5. Sheets 30열 row 변경

기존 30열 중 21번째 칸(0-indexed, `rate` 바로 다음에 오는 빈 칸 — 기존엔 항상 `''`)을 세금 총액으로 재사용한다. 열 개수/순서는 그대로 유지되므로 사용자가 시트 헤더를 손볼 필요는 없다(원래도 빈 칸이라 헤더가 있었다면 비어 있었을 칸).

```js
const row = [
  ...,
  sellDateCol, sellPriceCol, profit, rate,
  totalTax, status, '', '', '', '', '', '', '', ''   // 21번째 칸: '' → totalTax
];
```

---

## 6. 범위 밖

- "입력" 탭 수동 거래입력 폼은 변경하지 않음
- 세율(%) 자동계산 기능 없음 — 항상 원 금액 직접 입력
- 차수별 세금을 매매내역/카드에 개별로 보여주지 않음(합계만 표시)
