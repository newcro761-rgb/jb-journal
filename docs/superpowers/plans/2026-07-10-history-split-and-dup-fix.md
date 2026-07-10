# 내역 탭 2개로 분리 + 중복 거래 버그 수정

## Context
2계좌 분할(2026-07-08) 배포 후 실사용 중 사용자가 두 가지 문제를 보고함:

1. **모바일 UX**: 내역 탭이 PC에서는 2단(좌: 내 계좌, 우: 여자친구 계좌)으로 보이지만 640px 이하에서 1단 세로 스택이 되어 두 계좌를 번갈아 보기 어려움 → 최상단 탭 자체를 2개로 분리 요청.
2. **중복 거래**: "펌텍코리아(+39,646원)"가 최근거래에 2건 중복 표시.

## 중복 거래 — 진단 결과 (실측, 코드 수정 전 완료)
`getTrades` 응답을 직접 받아 종목코드+매수/매도 체결 내용이 동일한데 tradeId만 다른 그룹을 스캔:
- **내 계좌**: 전체 35건 중 **6개 그룹, 12개 행 중복** (019210 ×2그룹, 251970, 415640, 039830, 161890)
- **여자친구 계좌**: 전체 7건 중 **3개 그룹, 6개 행 중복** (251970, 415640, 039830)

펌텍코리아(251970) 사례 실측: `251970-20260708`(생성 2026-07-08 11:10 UTC)과 `251970-20260708-2`(생성 2026-07-09 11:10 UTC, **정확히 하루 뒤**) — 매수 2건·매도 3건(ord_no까지) 완전 동일.

**진짜 원인 (당초 가설이었던 OPENING 분기가 아니라 일반 진입 분기):** `build_trades()`의 `same_day_seq`/`entry_seq`는 "(종목,날짜)당 몇 번째 진입인지"를 상태파일에 영구 저장해 런 경계를 넘겨 재진입 접미사를 이어간다. 그런데 증분 동기화는 `[last_synced_date, today]`를 **포함-포함**으로 매일 재조회하므로, 어제 당일 진입+당일 청산으로 완결된 거래가 다음날 실행에서 **똑같은 매수 체결을 다시 만나면**, `qty==0` 진입 판정 로직이 이를 "새 진입"으로 오인하고 이미 저장된 entry_seq(=1)를 보고 `n=2`로 증가시켜 `-2` 접미사의 새 trade_id를 생성한다. `saveTrades_`는 tradeId가 다르니 정상적으로 새 행을 upsert(=insert)한다 — **당일 청산되는 모든 매매에서 청산 다음날 스케줄 동기화 때마다 구조적으로 재현되는 버그**이며, OPENING 분기(`opening_seq`, 마찬가지로 런마다 리셋되는 미영속 카운터)도 같은 클래스의 결함을 안고 있다.

**사용자 확정**: entry_seq 카운터 메커니즘 자체를 제거하고, 두 분기(일반 진입 / OPENING) 모두 트리거 체결의 고유값(체결일+주문번호)으로 trade_id를 결정론적으로 생성하는 방향으로 통일 수정. 예약 동기화(JB_TradeSync/_GF)는 계속 가동, 정리는 수정 배포 후 한 번에 일괄 처리.

**추가 검증 완료 (실행 전 재검토에서 확인):**
- `saveTrades_`(`Code.gs:158-173`)는 `getRange(existingRow, 1, 1, 16)`으로 **A~P(자동 16열)만** 덮어쓰고 Q~U(수동 5열: 자리차수/손절청산사유/규칙준수/테마/메모/통계제외)는 절대 건드리지 않음(주석에도 명시) — 확인 완료, 수정 후 "같은 trade_id로 매일 재upsert"가 정상 경로가 되어도 수동입력은 안전하게 보존됨. 별도 조치 불필요.
- **배포 직후 일시적으로 중복 행이 늘어나는 것은 정상**: 배포 후 첫 실행은 재조회 구간 안의 최근 거래를 새 형식 trade_id로 upsert하지만, 기존 구형식 행(예: `251970-20260708`, `-2`)은 그대로 남아있으므로 그룹당 한 행이 더 생긴 것처럼 보임 — Cleanup 단계에서 내용 기준 그룹핑으로 어차피 정리되므로 정상 동작. 미리 인지해두고 배포 직후 "더 늘었다"고 오판하지 않기.
- **추가로 발견된 별개의 버그 (같은 코드 영역, 같이 수정)**: `build_trades()`가 `resumed`(전날 미청산 lot)을 이어받을 때(`:232-241`), 이후 `fills` 루프(`:250-296`)가 재조회 구간과 겹치는 날짜의 체결을 필터링 없이 그대로 `current["buys"]`/`current["sells"]`에 append한다. 즉 여러 날에 걸쳐 열려있는 포지션의 진입일이 마침 `last_synced_date`(경계일)와 겹치면, 다음날 실행이 그 매수 체결을 다시 만나 **수량을 이중 계상**할 수 있음(현재 buy 딕셔너리엔 `ord_no`가 없어 중복 판정 자체가 불가능한 상태). trade_id 중복과 달리 이건 한 행 안에서 조용히 평단가/수량이 틀어지는 문제라 더 위험함. Change 2에 같이 포함해서 수정.

---

## Change 1 — 내역 탭을 2개의 최상단 탭으로 분리

**대상 파일:** `C:\Users\June\jb-journal\index.html`

**라벨/아이콘 확정**: 아이콘으로 계좌 구분 + 라벨 축소 — "📊 내역때때" / "💕 내역띠띠" (구체적 이모지는 구현 시 기존 스타일과 어울리는 것으로 조정 가능, 라벨 텍스트는 유지).

1. **탭바 버튼** (`:554-556`): 기존 "내역" 버튼 1개를 2개로 교체
   - `onclick="switchTab('history-me', this)"` → 아이콘 📊 + 라벨 "내역때때"
   - `onclick="switchTab('history-gf', this)"` → 아이콘 💕 + 라벨 "내역띠띠"
   탭바 내 위치(입력↔시트 사이) 유지.

2. **탭 이름 변경 전 안전점검**: `index.html` 전체에서 `tab-history`/`'history'` 문자열을 grep — `switchTab` 외에 CSS 셀렉터(`#tab-history`), 초기 활성 탭 지정, 기타 하드코딩된 참조가 남아있는지 확인 후 전부 같이 변경. 하나라도 놓치면 탭 전환이 조용히 깨짐.

3. **tab-content 마크업** (`:419-474`):
   - 기존 `<div id="tab-history" class="tab-content">` → `id="tab-history-me"`.
   - `.hist-columns` 래퍼(`:423`)와 "내 계좌" `.hist-column-label`(`:425`) 제거, 내부 컨텐츠(입출금 폼 `-me`, `stat-grid-me`, `summary-grid-me`, `hist-list-me`)를 `tab-history-me` 직계 자식으로 이동.
   - 새 `<div id="tab-history-gf" class="tab-content">`를 `tab-history-me` 뒤, `tab-sheets` 앞에 추가. "여자친구 계좌" 컬럼 내용(`:449-472`, `-gf` id 전부) 이동, `.hist-column-label` 제거.
   - 각 탭 자체 `page-title`: "매매내역(때때)" / "매매내역(띠띠)".

4. **CSS** (`:146-151`): `.hist-columns`, `.hist-column-label`, 관련 `@media (max-width: 640px)` 규칙 삭제.

5. **`switchTab()` 함수** (`:637-646`): `if (name === 'history') {...}` 블록을 아래로 교체
   ```
   if (name === 'history-me') { loadAutoTrades('me'); loadCapitalHistory('me'); renderHistory('me'); }
   if (name === 'history-gf') { loadAutoTrades('gf'); loadCapitalHistory('gf'); renderHistory('gf'); }
   ```

6. **변경 불필요**: `ACCOUNTS` 객체(`:581-584`), `DOMContentLoaded`(`:1561-1572`), 수동입력 `renderHistory('me')` 하드코딩 3곳(`~1062`,`~1272`,`~1290`), `acct` 파라미터화 함수들 — 전부 DOM id 문자열 보간이라 id 값 자체가 안 바뀌므로 그대로 동작.

**검증 시 추가 확인**: 탭바가 계획/입력/내역때때/내역띠띠/시트 **5개 버튼**이 되므로, 모바일 폭(375px) 헤드리스 스크린샷에서 줄바꿈되거나 넘치지 않는지 실제 5개 기준으로 확인.

---

## Change 2 — 중복 거래 근본 수정 (trade_id 생성 방식 통일)

**대상 파일:** `C:\Users\June\trade_sync.py`, `C:\Users\June\test_trade_sync.py`

### 코드 수정

`build_trades()` (`trade_sync.py:185-302`):
- 함수 시그니처에서 `entry_seq` 파라미터 제거: `def build_trades(all_fills, assigned, open_lots=None):`
- `same_day_seq` 딕셔너리 구성(`:243-247`)과 `opening_seq = 0`(`:248`) 완전 삭제.
- 일반 진입 분기(`:250-267`, `if f["side"]=="buy": if qty==0:`): trade_id를 `f"{stk_cd}-{f['ord_dt']}-{f['ord_no']}"`로 결정론적 생성 (트리거 매수 체결 자신의 ord_no 사용, 카운터 불필요).
- OPENING 분기(`:268-280`, `if current is None:`): trade_id를 `f"{stk_cd}-OPENING-{f['ord_dt']}-{f['ord_no']}"`로 결정론적 생성 (트리거 매도 체결 자신의 ord_no 사용).
- 반환값 `(trades, new_open_lots, new_entry_seq)` → `(trades, new_open_lots)`로 변경 (entry_seq 관련 부분 삭제, `new_entry_seq = dict(entry_seq)` 라인도 제거).
- `open_lots` 런 경계 연속성 메커니즘(`:232-241`, `resumed = open_lots.get(stk_cd)`)은 **그대로 유지** — 이건 별개의, 여전히 유효한 매커니즘(여러 날에 걸친 미청산 포지션이 같은 trade_id를 유지하도록 함).
- docstring(`:185-217`) 전면 개정: 기존 유진테크/파마리서치 사례를 "entry_seq 카운터 방식 자체의 한계로 재발했던 문제"로 재정리하고, 이번 펌텍코리아 등 9개 그룹 실측 사고 + ord_no 기반 결정론적 ID로 전환한 최종 해법을 문서화.

**추가 수정 — resumed lot 재조회 겹침 시 체결 이중 계상 방지** (위 "추가로 발견된 별개의 버그" 참고):
- 매수 딕셔너리 구성(`:263-266`)에 `"ord_no": f["ord_no"]` 필드 추가 (매도 딕셔너리는 이미 `ord_no` 보유, `:289`).
- `resumed`을 이어받아 `current`가 확정된 직후(`:232-241` 이후, 메인 루프 진입 전)에 `current["buys"]`+`current["sells"]`에 이미 있는 `ord_no` 집합을 구해두고, 메인 `for f in fills:` 루프(`:250`) 맨 앞에서 `f["ord_no"]`가 그 집합에 있으면 `continue`로 건너뛴다 — 이전 런에서 이미 반영된 체결이 겹치는 재조회 구간에서 다시 반영되는 것을 원천 차단.
- `Code.gs`의 `saveTrades_`는 자동 16열만 덮어쓰므로(A~P) buys_json에 `ord_no`가 추가되어도 문제없음 — 시트 스키마 변경 아님, 그냥 JSON 필드 하나 추가.

`load_open_lots(path)` / `save_open_lots(path, open_lots, entry_seq)` (`trade_sync.py:452-479`):
- `load_open_lots`: `return data.get("open_lots", {}), data.get("entry_seq", {})` → `return data.get("open_lots", {})` (단일 값 반환). 기존 상태파일에 남아있는 `entry_seq` 키는 그냥 무시됨(하위호환, 별도 마이그레이션 불필요).
- `save_open_lots`: `entry_seq` 파라미터와 pruning 로직(`:467-471`) 삭제, 저장 JSON에서 `"entry_seq"` 필드 제거.

`main()` 배선 (`trade_sync.py:701, 702, 726`):
- `:701` → `open_lots = {} if args.backfill else load_open_lots(cfg["open_lots_path"])`
- `:702` → `trades, new_open_lots = build_trades(grouped, assigned, open_lots)`
- `:726` → `save_open_lots(cfg["open_lots_path"], new_open_lots)`

### 테스트 수정 — `C:\Users\June\test_trade_sync.py`
(base Anaconda `python -m pytest test_trade_sync.py -v`, `C:\Users\June`에서 실행)
- `build_trades()`를 호출하는 모든 기존 테스트가 3-tuple 언패킹(`trades, open_lots, entry_seq = ...`)을 쓰고 있다면 2-tuple로 전부 수정.
- `trade_id` 리터럴을 단언하는 테스트(예: 재진입 접미사 `-2`/`-3`, OPENING 형식) 전부 새 `{stk_cd}-{ord_dt}-{ord_no}` / `{stk_cd}-OPENING-{ord_dt}-{ord_no}` 형식으로 갱신 — 각 테스트 픽스처의 실제 `ord_no` 값 기준.
- **신규 회귀 테스트 (이번 버그 직접 검증)**: 동일한 `all_fills`/`assigned` 입력으로 `build_trades()`를 두 번 호출(당일 청산 거래가 포함된 구간을 재조회하는 다음날 실행 시뮬레이션) → 생성되는 trade_id가 두 번 다 완전히 동일한지 확인.
- 같은 종목·같은 날 서로 다른 매수 체결로 시작되는 두 개의 독립적 진입(진짜 재진입) → 서로 다른 trade_id 부여되는지 확인 (ord_no가 다르므로 자동으로 충족되지만 명시적으로 커버).
- **신규 회귀 테스트 (겹침 이중 계상 검증)**: 미청산 상태로 넘어오는 `open_lots`(매수 1건 포함)를 전달하면서, 그 매수와 **동일 `ord_no`를 가진 매수 체결이 다시 포함된** `all_fills`(재조회 구간 겹침 시뮬레이션)로 `build_trades()`를 호출 → 결과 trade의 수량/매수 리스트가 중복 없이 원래 그대로인지 확인 (수정 전이면 이 테스트가 실패해야 정상 — 버그 재현 테스트).
- 전체 테스트 스위트 통과 확인.

### 정리(Cleanup) — 스크립트 기반, 수정 배포 후 일괄 실행
당초 계획은 수동 삭제였으나, 실측 결과 이미 내 계좌 12행·여친 계좌 6행(총 9개 그룹) 중복이 있고 수정 배포 전까지 매일 더 쌓일 수 있어 **스크립트 기반 정리로 변경**:
- 배포 후 하루 이상 지나 신규 중복 발생이 멈췄는지 확인한 다음(정상 동작 검증 겸), `getTrades` 응답을 다시 받아 이번에 쓴 것과 동일한 방식(종목코드+매수/매도 체결 내용 동일 그룹핑)으로 전체 중복 그룹을 재탐색.
- 각 중복 그룹에서 남길 행 선택 기준: 수동입력 컬럼(Q~U: 자리차수/손절청산사유/규칙준수/테마/메모/통계제외)이 채워진 쪽 우선, 둘 다 비어있으면 더 먼저 생성된(오래된, `updatedAt` 기준) 행 보존.
- Apps Script에 임시 정리용 함수를 추가하거나(예: `cleanupDuplicateTrades()` — Sheets에서 직접 실행 후 삭제) 로컬 Python 스크립트로 Sheets API를 통해 처리하는 방법 중 구현 시점에 더 간단한 쪽 선택. 두 계좌(내 계좌/여친 계좌) 모두 동일하게 적용.
- 정리는 되돌릴 수 없는 삭제이므로, 실행 전 각 시트를 사본으로 백업(파일 복사)해두고 진행.

---

## 검증 방법
- Change 2: `python -m pytest test_trade_sync.py -v` (base Anaconda python, `C:\Users\June`) 전체 통과. 배포 후 다음날 스케줄 동기화 결과를 `getTrades`로 재확인해 신규 중복이 발생하지 않는지 확인 (하루 이상의 실측 관찰 필요).
- Change 1: 브라우저에서 `index.html` 직접 열어 입력→내역때때→내역띠띠→시트 순서 클릭, 각 탭 데이터 로드/렌더 확인. 입출금 추가, 자동카드 수동입력 모달 계좌별 동작 확인. 헤드리스 msedge로 데스크톱(1000px)+모바일(375px) 스크린샷 및 콘솔 로그 확인 — **탭바 5개 버튼이 모바일에서 줄바꿈/넘침 없는지 포함**.
- 두 변경 모두 `git push origin main`으로 배포(jb-journal repo). Change 2는 `trade_sync.py`가 있는 별도 git repo(`C:\Users\June`)에서 별도 커밋/푸시.
- 최종적으로 실제 사이트(`https://newcro761-rgb.github.io/jb-journal/`)에서 중복이 사라졌는지, 모바일에서 두 탭이 잘 보이는지 육안 확인.

## 실행 순서
1. Change 2 코드 수정 + 테스트 (선행 — 더 이상의 중복 누적을 막는 게 우선순위)
2. Change 2 배포 (trade_sync.py repo push) — 예약 작업은 계속 가동 중이므로 배포 즉시 다음 실행부터 적용됨
3. Change 1 (프론트엔드, 독립적이므로 병행 가능)
4. Change 2 코드가 하루 이상 안정 동작 확인 후 → 스크립트 기반 Sheet 중복 정리 (내 계좌 + 여친 계좌)

`superpowers:subagent-driven-development` 스킬로 Task 단위 실행(구현→리뷰→원장 기록), 이전 세션과 동일 패턴.
