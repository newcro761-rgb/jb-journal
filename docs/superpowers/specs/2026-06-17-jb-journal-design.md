# JB 단타 매매 저널 — 설계 문서

**날짜:** 2026-06-17  
**배포:** GitHub Pages (정적)  
**저장소:** `jb-journal`

---

## 1. 개요

JB(김종봉) 단타매매 방법론에 맞춘 거래 기록 웹 앱.  
회사에서 폰으로 접속해서 사용하는 것이 주 환경.

---

## 2. 파일 구조

```
jb-journal/
├── index.html      ← HTML + CSS + JS 전체 (단일 파일)
└── manifest.json   ← PWA 설치용
```

---

## 3. 기술 스택

- 순수 HTML/CSS/JS (프레임워크 없음, CDN 없음)
- PWA: manifest.json + apple-mobile-web-app-capable 메타태그
- 아이콘: SVG 데이터URI (외부 파일 없음)
- 데이터 저장: Google Apps Script Web App (POST)

---

## 4. 탭 구조

### 탭 1 — 거래 입력

**입력 필드:**

| 필드 | 타입 | 비고 |
|------|------|------|
| 케이스 | 버튼 3개 (케이스1/2/3) | 선택된 것 강조, 케이스1이면 2차 영역 숨김 |
| 종목명 | text | |
| 종목코드 | text | |
| 매수일 | date | |
| 1차 매수가 | number | |
| 1차 수량 | number | |
| 2차 매수가 | number | 케이스1이면 숨김 |
| 2차 수량 | number | 케이스1이면 숨김 |
| 실제 매도가 | number | |
| 매도일 | date | |
| 상태 | select | 보유중 / 수익(1차만) / 수익(2차까지) / 손절(1차만) / 손절(2차까지) |
| 매수 이유 | pill 버튼 멀티 | 기준봉 돌파 / 1선 눌림목 / 2선 눌림목 / 대장주 / 테마주 / 섹터주 / 뉴스 모멘텀 / 상대강도 |
| 메모 | textarea | |

**자동 계산 (oninput 즉시 반영):**

```js
// 평균단가
avg = (케이스1) ? b1 : (b1*q1 + b2*q2) / (q1 + q2)

// 손절
sl1 = Math.round(b1 * 0.93)           // 1차 매수가 기준 손절
sl  = Math.round(avg * 0.93)          // 통합 손절가

// 목표
t1 = Math.round(avg * 1.03)
t2 = Math.round(avg * 1.05)
t3 = Math.round(avg * 1.07)

// 금액
totalAmt = b1*q1 + b2*q2
totalQty = q1 + q2
profit   = Math.round((sell - avg) * totalQty)
rate     = (sell - avg) / avg

// 수수료 (키움 0.015%)
fee      = Math.round((totalAmt + sell*totalQty) * 0.00015)
netProfit = profit - fee
```

**저장:** JSON POST → Apps Script Web App

### 탭 2 — 재세팅 계산기

2차 체결 알림 수신 즉시 폰으로 열어서 사용.

**입력:** 1차 매수가, 1차 수량, 2차 체결가, 2차 수량

**출력:**

| 항목 | 공식 |
|------|------|
| 새 평균단가 | (b1×q1 + b2×q2) / (q1+q2) |
| 재세팅 손절가 | avg × 0.93 |
| 1차 목표가 | avg × 1.03 |
| 2차 목표가 | avg × 1.05 |
| 3차 목표가 | avg × 1.07 |
| 총 보유수량 | q1 + q2 |
| 1차 매도 수량 | round(총수량 × 0.4) |
| 2차 매도 수량 | round((총수량 - 1차) × 0.67) |
| 3차 매도 수량 | 총수량 - 1차 - 2차 |

### 탭 3 — 시트 열기

Google Sheets 링크로 이동하는 큰 버튼 하나.

---

## 5. Google Sheets 컬럼 구조 (30컬럼)

| # | 컬럼명 | 값 |
|---|--------|----|
| 1 | 매수일 | 입력값 |
| 2 | 종목명 | 입력값 |
| 3 | 종목코드 | 입력값 |
| 4 | 1차 매수가 | 입력값 |
| 5 | 1차 수량 | 입력값 |
| 6 | 1차 총액 | b1×q1 |
| 7 | 1차 목표가 | b1×1.03 |
| 8 | 2차 매수가 | 입력값 (없으면 공백) |
| 9 | 2차 수량 | 입력값 (없으면 공백) |
| 10 | 2차 총액 | b2×q2 (없으면 공백) |
| 11 | 평균단가 | 계산값 |
| 12 | 총 매수금액 | b1×q1 + b2×q2 |
| 13 | 통합 손절가 | avg×0.93 |
| 14 | 통합 1차 목표 | avg×1.03 |
| 15 | 통합 2차 목표 | avg×1.05 |
| 16 | 통합 3차 목표 | avg×1.07 |
| 17 | 최대 손실액 | 총매수금액×0.07 |
| 18 | 매도일 | 입력값 |
| 19 | 실제 매도가 | 입력값 |
| 20 | 수익금 | (매도가-avg)×총수량 |
| 21 | 수익률 | (매도가-avg)/avg |
| 22 | (빈칸) | |
| 23 | 상태 | 입력값 |
| 24 | 케이스 | 케이스1/2/3 |
| 25 | 매수 이유 | 쉼표 구분 문자열 |
| 26~29 | (빈칸) | |
| 30 | 메모 | 입력값 |

---

## 6. Apps Script POST 형식

```js
fetch(APPS_SCRIPT_URL, {
  method: 'POST',
  body: JSON.stringify({ row: [col1, col2, ..., col30] })
})
```

Apps Script (`doPost`):
```js
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow(data.row);
  return ContentService.createTextOutput('OK');
}
```

---

## 7. 디자인 시스템

| 요소 | 값 |
|------|-----|
| 배경 | `#1a1a2e` (다크) |
| 카드 배경 | `#16213e` |
| 계산결과 배경 | `#0f3460` |
| 재세팅 강조 | `#e94560` (주황-빨강) |
| 손절/손실 | `#ff4757` (빨강) |
| 수익/목표 | `#2ed573` (초록) |
| 입력값 | `#ffffff` |
| 최대 너비 | 480px |
| 탭바 | 하단 고정 |

---

## 8. PWA 설정 (manifest.json)

```json
{
  "name": "JB 매매 저널",
  "short_name": "JB저널",
  "display": "standalone",
  "start_url": "./index.html",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e"
}
```

---

## 9. URL 플레이스홀더

```js
const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL';
const SHEETS_URL      = 'YOUR_SHEETS_URL';
```

나중에 Apps Script 배포 후 두 값만 교체하면 됨.

---

## 10. 미구현 / 범위 밖

- 기존 6건 거래 데이터 임포트 (Sheets에서 직접 관리)
- 거래 내역 조회/필터 화면
- 오프라인 캐시 (서비스 워커)
