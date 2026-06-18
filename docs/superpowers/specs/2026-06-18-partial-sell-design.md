# 결과 입력 모달 — 분할매도(차수별 매도가/매도일) 지원 설계 문서

**날짜:** 2026-06-18
**대상 파일:** `jb-journal/index.html` (결과 입력 모달 부분), Apps Script (Plans 시트 백엔드)

---

## 1. 배경 / 목표

JB 매매법은 +3%/+5%/+7% 목표가에서 나눠서 매도하는 것이 기본이다. 그런데 현재 "계획" 탭의 결과 입력 모달은 "실제 매도가" 칸이 1개뿐이라, 분할매도한 실제 거래를 기록할 수 없다.

이 기능은 **결과 입력 모달에만** 적용한다. "입력" 탭의 수동 거래입력 폼(실제매도가 1칸)은 이번 범위에서 건드리지 않는다.

---

## 2. 매도 차수 입력 UI

- 매도 입력은 **1~3행 가변**. 모달을 열면 기본 1행이 보이고, "+ 매도 추가" 버튼으로 최대 3행까지 늘릴 수 있다. 각 행은 ✕ 버튼으로 삭제 가능(최소 1행 유지).
- 각 행 입력값: **매도가(number) / 수량(number) / 매도일(date)**. 수량은 차수마다 직접 입력한다(자동 분배하지 않음).
- 모달 상단에 종목명 옆에 보유 현황 표시: `총 OOO주 · 매도완료 OOO주 · 남음 OOO주`. "매도완료"는 이전 세션에서 이미 저장된 `plan.sells` 합계.
- 결과 버튼(✅1차익절 등 4개)은 제거한다. 수익/손절 여부는 저장 시 자동 계산한다.

### 2차 매수 실제 체결 여부

계획에 2차 매수가/수량(`plan.b2`, `plan.q2`)이 있는 종목은, 평단가 계산에 2차를 포함할지 여부를 알아야 한다(시세가 2차 매수가까지 안 빠져서 2차를 못 샀을 수 있기 때문).

- 모달에 토글 "2차 매수 실제 체결" 추가. `plan.b2 && plan.q2`가 있는 경우에만 노출.
- 기본값: ON (체결됐다고 가정).
- 이 값은 **그 계획의 첫 매도 저장 시 한 번 정해지면 `plan.use2`에 저장**되고, 이후 추가 매도 세션에서는 토글을 다시 묻지 않고 저장된 값을 그대로 사용한다(평단가가 거래 중간에 바뀌면 이전 차수 수익 계산이 깨지므로).
- `use2 = true`  → 총수량 = q1+q2, 평단 = (b1·q1 + b2·q2)/(q1+q2)
- `use2 = false` → 총수량 = q1, 평단 = b1

---

## 3. 저장 로직

저장 버튼 클릭 시:

1. 입력된 행 중 매도가/수량/매도일이 모두 채워진 행만 유효한 행으로 취급. 유효한 행이 0개면 에러 토스트.
2. `신규매도수량 = 유효한 행들의 수량 합`
3. `남은수량 = 총수량 - (plan.sells 기존 합)`
4. `신규매도수량 > 남은수량` 이면 에러 토스트("남은 수량보다 많습니다"), 저장 안 함.
5. `plan.sells`에 신규 행들을 append. `plan.use2`가 아직 없으면 토글값으로 설정.
6. **`신규매도수량 === 남은수량`** (남은 수량을 정확히 다 팔아서 전량 매도 완료)인 경우:
   - 전체 `plan.sells`(이번 차수 포함)를 가지고 종합 수익/수익률 계산 → localStorage 매매내역에 1건 추가
   - 30열 Sheets row POST (기존 `{row:[...]}` 방식 그대로, 매도일/매도가 칸만 차수별 요약 텍스트로 구성 — 4번 항목 참고)
   - Apps Script에 `plan-delete` POST (계획 목록에서 제거, 기존 로직 그대로)
   - 로컬 plans 배열에서도 제거
7. 합계가 총수량보다 작은 경우(부분 매도, 잔량 보유중):
   - 로컬 plans 배열의 해당 plan 객체를 갱신(`sells`, `use2` 반영)
   - Apps Script에 `plan-update` POST (신규, 5번 항목 참고)로 Plans 시트 행을 통째로 덮어씀
   - 모달 닫고 카드 목록 다시 렌더링(진행 표시 갱신)

### 종합 계산 (전량 매도 시점)

```js
totalQty   = use2 ? q1+q2 : q1
avgBuy     = use2 ? (b1*q1+b2*q2)/(q1+q2) : b1
totalAmt   = b1*q1 + (use2 ? b2*q2 : 0)
soldAmt    = sum(sells.map(s => s.price * s.qty))
profit     = Math.round(soldAmt - avgBuy*totalQty)
rate       = (soldAmt/totalQty - avgBuy) / avgBuy
status     = (profit >= 0 ? '수익' : '손절') + `(${sells.length}차분할)`
```

---

## 4. 매매내역(History) 데이터 모양 변경

localStorage 키 `jb-history`의 각 항목:

```js
{
  id, date,            // date = 마지막(가장 늦은) 매도일
  name, code,
  status,              // 자동 판단된 문자열, 예: "수익(2차분할)"
  avg,                 // 평단가
  sells: [{ qty, price, date }, ...],   // 신규: 차수별 매도 내역
  totalQty, profit, rate
}
```

`renderHistory()`의 매도가/날짜 표시는 `sells.length`가 1보다 크면 `hist-meta`에 작게 "N건 분할매도" 텍스트를 덧붙인다. 그 외 합계/통계 카드 로직은 변경 없음(이미 `profit`, `rate` 합산값 사용).

### Sheets 30열 row 포맷 변경

`saveResult()`가 Apps Script로 보내는 row의 18번(매도일)/19번(실제매도가) 컬럼만 변경:

```js
sellDateCol  = sells.map(s => s.date).join(' / ')
sellPriceCol = sells.map(s => `${s.price}(${s.qty}주)`).join(' / ')
```

나머지 28개 컬럼은 기존 그대로(평단/총매수금액/손절가/목표가 등은 `avgBuy`/`totalAmt` 기준으로 계산, 변경 없음). Apps Script의 거래 저장 로직(`sheet.appendRow(data.row)`)은 그대로 두면 되므로 **백엔드 수정 불필요**.

---

## 5. Apps Script — Plans 백엔드 전체 재작성

기존 코드 일부(plan-delete, 거래 row 저장)는 사용자가 보내준 조각으로 확인했고, `doGet`/`plan-save` 부분은 `index.html`이 주고받는 데이터 모양으로부터 역으로 재구성한다. **사용자가 기존 Apps Script 코드를 전부 지우고 아래 코드로 통째로 교체**하는 방식으로 진행한다(부분 패치 아님 — 원본 전체를 보지 못했으므로 안전하게 통짜 교체).

Plans 시트 컬럼(10개, A~J): `id, date, name, code, b1, q1, b2, q2, custSL, sellsJson`

- `sellsJson`: `JSON.stringify(plan.sells || [])` 문자열. `plan.use2`는 `sellsJson`과 함께 한 컬럼에 묶어서 저장하지 않고, **11번째 컬럼(K) `use2`**에 별도 저장(`true`/`false`/빈칸).

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

  // 거래 저장 (기존)
  const sheet = ss.getActiveSheet();
  sheet.appendRow(data.row);
  return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
    .setMimeType(ContentService.MimeType.JSON);
}
```

프론트엔드(`initPlans()`)는 `r[9]`를 `JSON.parse(r[9]||'[]')`로 `sells`에, `r[10]`을 `use2`(boolean, 빈칸이면 `undefined`)로 매핑하도록 수정한다.

---

## 6. 계획 카드(대기 목록) UI 변경

`renderPlans()`에서 `plan.sells.length > 0`인 카드에 작은 진행 표시 행 추가:

```
매도진행: 50/150주 · 평균 11,000원
```

차수별 상세(가격/날짜)는 카드에는 안 보여주고, 결과 입력 모달을 다시 열었을 때 상단 보유 현황(`총/매도완료/남음`)으로만 확인 가능하게 한다(카드 공간이 좁으므로 — YAGNI).

---

## 7. 범위 밖

- "입력" 탭 수동 거래입력 폼은 변경하지 않음
- 기존에 이미 Plans 시트에 저장된 행(컬럼 9개)에 대한 마이그레이션 스크립트는 작성하지 않음 — 새 컬럼(`sellsJson`, `use2`)이 빈칸이어도 `JSON.parse('' || '[]')`로 안전하게 처리되므로 기존 데이터는 그대로 호환됨
- 자동 분할 비율(40%/67%) 계산기는 이번 범위에 포함하지 않음(이미 차수별 수량을 직접 입력하기로 결정)
