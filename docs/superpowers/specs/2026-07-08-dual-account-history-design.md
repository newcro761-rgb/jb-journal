# 히스토리 탭 2계좌(내 계좌 / 여자친구 계좌) 분할 표시

## Context

사용자가 여자친구와 함께 jb-journal 매매일지 앱을 쓰고 있다. 지금은 히스토리 탭(매매내역+통계)이 사용자 본인의 키움 계좌 데이터만 보여준다. 여자친구도 자기 키움 계좌를 자동동기화로 연결해서, 같은 화면에서 두 사람의 매매내역을 나란히 비교하고 싶어한다.

브레인스토밍 과정에서 확정한 스코프:
- 2단 분할은 **히스토리(매매내역) 탭에만** 적용한다. 매매계획/매매입력 탭은 그대로 둔다.
- 여자친구 계좌 데이터는 **키움 API 자동동기화**로만 들어온다 (수동 입력 UI는 만들지 않음 — 매매입력 탭이 스코프 밖이므로).
- 데이터 저장은 **여자친구용 독립 Google Sheet + 독립 Apps Script 배포**로 완전히 분리한다 (기존 `Code.gs`/시트는 무수정).
- PC는 좌(내 계좌)/우(여자친구 계좌) 2단, 모바일은 위/아래로 쌓는다.
- 두 계좌의 통합 합계는 만들지 않는다 (각자 독립적인 통계만).

## 아키텍처

### 1. 여자친구 계좌용 백엔드 (독립 시트 + 배포)

- **전제조건 (코드 작업 전에 필요)**: 여자친구 본인이 키움증권에서 Open API 앱키(appkey/secretkey)를 발급받아야 한다. API 키는 계좌 소유자 본인 명의로만 발급 가능하기 때문.
- 기존 Google Sheet를 복제해 `fills`/`trades`/`capital` 3개 탭만 있는 새 시트를 만든다 (`Plans`, `premarket_checks` 탭은 여자친구 쪽에 불필요하므로 생략).
- 기존 `apps-script/Code.gs`를 그대로 그 새 시트에 바인딩해서 별도 Web App으로 배포한다 → 새로운 `APPS_SCRIPT_URL_GF`가 생긴다.
- 코드 변경 없음 — `Code.gs`는 이미 계좌 개념 없이 시트 하나만 다루도록 짜여 있으므로, 그대로 재사용하고 바인딩 대상 시트만 다르게 하는 방식이 가장 리스크가 낮다.

### 2. `trade_sync.py` — `--account` 옵션 추가

- `python trade_sync.py --account {me,gf}` (기본값 `me`, 인자 없으면 기존과 완전히 동일하게 동작 — 하위호환 유지).
- env var를 계좌별로 분리 (`.env`에 추가):
  - `KIWOOM_APPKEY_GF`, `KIWOOM_SECRETKEY_GF`, `APPS_SCRIPT_URL_GF`
  - 기존 `KIWOOM_APPKEY`/`KIWOOM_SECRETKEY`/`APPS_SCRIPT_URL`은 `me` 계정용으로 그대로 유지.
- 상태 파일도 계좌별로 분리해서 두 계좌의 동기화 상태가 섞이지 않게 한다:
  - `LAST_SYNC_PATH` → `last_sync.json` (me) / `last_sync_gf.json` (gf)
  - `QUEUE_PATH` → `trade_sync_unsent_queue.json` (me) / `trade_sync_unsent_queue_gf.json` (gf)
- **주의**: 현재 `trade_sync.py`에는 런 간 미청산 lot 연속성 버그수정 작업이 미커밋 상태로 남아있다(`build_trades`가 `open_lots`/`entry_seq`를 이어받는 로직). `--account` 옵션은 이 작업 위에 얹어서 구현하고, 해당 미커밋 변경분을 건드리거나 되돌리지 않는다.
- 스케줄링: `auto_trade_sync_gf.bat`을 기존 `auto_trade_sync.bat`과 동일 패턴으로 하나 더 만들고, schtasks에 같은 시간대(20:10 KST)로 새 작업을 등록한다.

### 3. 프론트엔드 (`index.html`) — 히스토리 탭 2단 렌더링

현재 히스토리 탭은 전역 상태(`autoTrades`, `capitalHistory`)와 고정 DOM id(`stat-grid`, `hist-list`, `summary-grid`, `capital-total-display`)로 계좌 하나만 렌더링하도록 짜여 있다. 이를 계좌 키로 파라미터화한다:

- 상태를 `accounts = { me: { url: APPS_SCRIPT_URL, autoTrades: [], capitalHistory: [] }, gf: { url: APPS_SCRIPT_URL_GF, autoTrades: [], capitalHistory: [] } }` 형태로 재구성.
- `loadAutoTrades`, `loadCapitalHistory`, `getMergedHistory`, `renderHistory`를 계좌 키(`'me'`/`'gf'`)를 인자로 받도록 일반화하고, DOM id에 `-me`/`-gf` 접미사를 붙여 두 세트를 나란히 렌더링.
- 여자친구 컬럼은 자동동기화(🤖) 거래만 표시한다 — `normalizeAutoTrade`, 편집 모달(자리차수/손절청산사유/규칙준수/테마/메모), 제외 토글 등 기존 로직은 그대로 재사용하되 대상 계좌만 다르게 지정.
- 수동 입력(localStorage `jb-history`)은 `me` 계좌 전용으로 유지 (여자친구 쪽엔 애초에 표시할 수동 기록이 없음).
- 레이아웃: `.hist-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }`로 좌우 배치, `@media (max-width: 640px)` 구간에서 `grid-template-columns: 1fr`로 세로 스택.
- 각 컬럼 상단에 라벨 표시: "내 계좌" / "여자친구 계좌" (필요 시 사용자가 원하는 이름으로 교체 가능하도록 상수로 분리).
- 통합 합계는 만들지 않음 — 두 컬럼은 완전히 독립된 통계(`stat-grid`, `summary-grid`)를 각각 가진다.

## 검증 방법

- `trade_sync.py --account gf --dry-run`으로 여자친구 계좌 조회→조인→trade 판정까지 콘솔 표로 확인 (실제 Sheets 기록 없이).
- 브라우저에서 `index.html`을 열어 히스토리 탭 진입 시 두 컬럼이 각자의 Apps Script URL로 fetch하는지 네트워크 탭으로 확인, 실데이터 없을 때 "아직 기록이 없습니다" 빈 상태가 컬럼별로 독립적으로 뜨는지 확인.
- 모바일 폭(예: 375px)으로 브라우저 리사이즈해서 2단이 세로로 스택되는지 확인.
- 기존 `me` 계좌 단독 동작(인자 없이 `trade_sync.py` 실행)이 이번 변경으로 깨지지 않았는지 회귀 확인.
