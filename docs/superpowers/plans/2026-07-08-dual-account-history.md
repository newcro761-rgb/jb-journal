# 히스토리 탭 2계좌(내 계좌/여자친구 계좌) 분할 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** jb-journal 매매일지의 히스토리(매매내역) 탭을 내 계좌/여자친구 계좌 2단으로 나눠서, 여자친구의 키움 계좌도 자동동기화로 나란히 비교할 수 있게 한다.

**Architecture:** 여자친구 계좌는 별도 Google Sheet + 별도 Apps Script 배포로 완전히 독립시킨다 (기존 `Code.gs`/시트 무수정). `trade_sync.py`는 `--account {me,gf}` 옵션으로 계좌별 env var/상태파일을 분기한다. `index.html`은 `autoTrades`/`capitalHistory` 전역 변수를 계좌 키를 가진 객체로 바꾸고, 렌더 함수들을 계좌 인자를 받도록 일반화해 좌우(모바일은 상하) 2단으로 그린다.

**Tech Stack:** Python 3.7(trade_sync.py, pytest), 순수 HTML/JS 단일 파일(index.html, 빌드도구 없음), Google Apps Script(Code.gs), Windows 작업 스케줄러(schtasks)

## Global Constraints

- 기존 `me` 계좌 동작은 인자 없이 실행 시 완전히 하위호환 유지 (env var 이름, 상태파일 경로 모두 기존 그대로)
- `Code.gs`는 무수정 — 여자친구 시트에 그대로 재배포
- 여자친구 컬럼은 키움 자동동기화(🤖) 데이터만 다룬다 — localStorage 수동 매매입력(`jb-history`)은 `me` 전용
- 두 계좌 통합 합계는 만들지 않는다 — 완전히 독립된 통계
- `.env`에는 이미 `KIWOOM_APPKEY_GF`/`KIWOOM_SECRETKEY_GF`가 추가되어 있다 (사용자가 완료함)
- 프론트엔드는 빌드/테스트 도구가 없는 프로젝트 관례를 따른다 — 검증은 브라우저 직접 확인
- **pytest 실행 환경 주의**: `test_trade_sync.py`를 돌릴 때는 PATH의 기본 `python`(Anaconda base, pytest 5.3.5 설치됨)을 쓴다 — `screener_venv`에는 pytest가 없다(`No module named pytest` 확인함). 반대로 `trade_sync.py`를 실제로 실행할 때(스모크 테스트, 배치 파일)는 반드시 `C:\Users\June\screener_venv\Scripts\python.exe`를 쓴다 — 이쪽에 `FinanceDataReader`/`requests`/`dotenv` 등 런타임 의존성이 설치돼 있다. 즉 **테스트=`python`, 실행=`screener_venv\Scripts\python.exe`**로 구분한다.

---

### Task 1: `trade_sync.py` — 계좌별 설정 resolver 함수

**Files:**
- Modify: `C:\Users\June\trade_sync.py`
- Test: `C:\Users\June\test_trade_sync.py`

**Interfaces:**
- Produces: `account_config(account: str) -> dict` — 키: `appkey_env`, `secretkey_env`, `apps_script_env`, `last_sync_path`, `queue_path`, `open_lots_path`, `label`

- [ ] **Step 1: 실패하는 테스트 작성**

`test_trade_sync.py` 맨 아래에 추가:

```python
from trade_sync import account_config


def test_account_config_me_uses_unsuffixed_names_for_backward_compat():
    cfg = account_config("me")
    assert cfg["appkey_env"] == "KIWOOM_APPKEY"
    assert cfg["secretkey_env"] == "KIWOOM_SECRETKEY"
    assert cfg["apps_script_env"] == "APPS_SCRIPT_URL"
    assert cfg["last_sync_path"] == r"C:\Users\June\last_sync.json"
    assert cfg["queue_path"] == r"C:\Users\June\trade_sync_unsent_queue.json"
    assert cfg["open_lots_path"] == r"C:\Users\June\open_lots.json"
    assert cfg["label"] == "내 계좌"


def test_account_config_gf_uses_suffixed_names_and_paths():
    cfg = account_config("gf")
    assert cfg["appkey_env"] == "KIWOOM_APPKEY_GF"
    assert cfg["secretkey_env"] == "KIWOOM_SECRETKEY_GF"
    assert cfg["apps_script_env"] == "APPS_SCRIPT_URL_GF"
    assert cfg["last_sync_path"] == r"C:\Users\June\last_sync_gf.json"
    assert cfg["queue_path"] == r"C:\Users\June\trade_sync_unsent_queue_gf.json"
    assert cfg["open_lots_path"] == r"C:\Users\June\open_lots_gf.json"
    assert cfg["label"] == "여자친구 계좌"
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `python -m pytest test_trade_sync.py -k account_config -v` (cwd: `C:\Users\June`)
Expected: FAIL — `ImportError: cannot import name 'account_config'`

- [ ] **Step 3: 최소 구현 작성**

`trade_sync.py`의 `LAST_SYNC_PATH`/`QUEUE_PATH`/`OPEN_LOTS_PATH` 상수 정의 바로 아래(현재 417~419행)에 추가:

```python
ACCOUNT_LABELS = {"me": "내 계좌", "gf": "여자친구 계좌"}


def account_config(account):
    """계좌별 env var 이름과 상태파일 경로를 반환. 'me'는 기존 이름/경로 그대로(하위호환)."""
    suffix = "" if account == "me" else f"_{account.upper()}"
    path_suffix = "" if account == "me" else f"_{account}"
    return {
        "appkey_env": f"KIWOOM_APPKEY{suffix}",
        "secretkey_env": f"KIWOOM_SECRETKEY{suffix}",
        "apps_script_env": f"APPS_SCRIPT_URL{suffix}",
        "last_sync_path": rf"C:\Users\June\last_sync{path_suffix}.json",
        "queue_path": rf"C:\Users\June\trade_sync_unsent_queue{path_suffix}.json",
        "open_lots_path": rf"C:\Users\June\open_lots{path_suffix}.json",
        "label": ACCOUNT_LABELS[account],
    }
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `python -m pytest test_trade_sync.py -k account_config -v`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
cd C:\Users\June
git add trade_sync.py test_trade_sync.py
git commit -m "feat: add account_config resolver for multi-account trade sync"
```

---

### Task 2: `trade_sync.py` — 상태파일 함수를 경로 인자로 파라미터화

기존 `load_last_sync`/`save_last_sync`/`load_open_lots`/`save_open_lots`/`load_queue`/`save_queue`/`enqueue_failed`/`retry_queue`는 모듈 전역 상수(`LAST_SYNC_PATH` 등)를 직접 참조한다. `main()`에서 `account_config()`가 계산한 경로를 넘겨줄 수 있도록 인자로 바꾼다.

**Files:**
- Modify: `C:\Users\June\trade_sync.py:422-502` (load/save 함수들), `:636-719` (`main()`)

**Interfaces:**
- Consumes: `account_config()` (Task 1)
- Produces: `load_last_sync(path)`, `save_last_sync(path, synced_date_str)`, `load_open_lots(path)`, `save_open_lots(path, open_lots, entry_seq)`, `load_queue(path)`, `save_queue(path, items)`, `enqueue_failed(path, body)`, `retry_queue(path, url)` — 전부 첫 인자로 경로를 받는 시그니처로 변경

이 태스크는 순수 배관(plumbing) 작업이라 리팩터 자체의 새 단위 테스트는 만들지 않는다(로직 변경 없음). 대신 Task 1에서 만든 기존 회귀 테스트(`test_split_partial_sell_across_runs_merges_into_one_trade` 등)가 계속 통과하는지로 안전망을 삼는다.

- [ ] **Step 1: 회귀 테스트가 현재 통과하는지 먼저 확인 (베이스라인)**

Run: `python -m pytest test_trade_sync.py -v`
Expected: 기존 테스트 전부 PASS (베이스라인 확보)

- [ ] **Step 2: load/save 함수들을 경로 인자 방식으로 수정**

`trade_sync.py`의 421~478행(`load_last_sync`부터 `save_queue`까지)을 다음으로 교체:

```python
def load_last_sync(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_last_sync(path, synced_date_str):
    data = {
        "last_synced_date": synced_date_str,
        "last_sync_run_at": datetime.now().isoformat(),
        "schema_version": 1,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_open_lots(path):
    """미청산 lot 상태(open_lots)와 당일 재진입 접미사 카운터(entry_seq)를 복원한다.

    build_trades()가 런 경계를 넘어 같은 trade_id로 이어붙이는 데 쓰인다 — 자세한 배경은
    build_trades() 문서 참고. 파일이 없으면 최초 실행이거나 --backfill 직후라는 뜻이라
    빈 상태로 시작한다.
    """
    if not os.path.exists(path):
        return {}, {}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("open_lots", {}), data.get("entry_seq", {})


def save_open_lots(path, open_lots, entry_seq):
    """entry_seq는 당일 재진입 충돌 방지가 목적이라 3일 넘게 지난 날짜 키는 정리한다."""
    cutoff = (date.today() - timedelta(days=3)).strftime("%Y%m%d")
    pruned_entry_seq = {
        key: n for key, n in entry_seq.items() if key.split("|", 1)[1] >= cutoff
    }
    data = {
        "schema_version": 1,
        "saved_at": datetime.now().isoformat(),
        "open_lots": open_lots,
        "entry_seq": pruned_entry_seq,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_queue(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_queue(path, items):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def enqueue_failed(path, body):
    q = load_queue(path)
    q.append({"body": body, "failed_at": datetime.now().isoformat(), "attempt": 1})
    save_queue(path, q)


def retry_queue(path, url):
    """이전 실행에서 실패해 쌓인 POST를 이번 실행 맨 앞에서 재시도. 성공한 것만 큐에서 제거."""
    q = load_queue(path)
    if not q:
        return 0, 0
    remaining = []
    recovered = 0
    for item in q:
        try:
            _post_json(url, item["body"])
            recovered += 1
        except Exception:
            item["attempt"] += 1
            remaining.append(item)
    save_queue(path, remaining)
    return recovered, len(remaining)
```

`LAST_SYNC_PATH`/`QUEUE_PATH`/`OPEN_LOTS_PATH` 전역 상수 3줄(현재 417~419행)은 삭제한다 — `account_config()`가 대체한다.

`sync_to_sheets` 함수(505~528행) 안에서 `enqueue_failed(fills_body)` / `enqueue_failed(trades_body)`를 호출하는 부분을 `queue_path` 인자를 받도록 수정:

```python
def sync_to_sheets(url, queue_path, all_fills, trades):
    """fills/trades를 POST. 실패한 건은 큐에 남기고 (True/False, 메시지) 반환 — 전체 성공해야 True."""
    ok = True
    messages = []

    fills_body = build_fills_payload(all_fills)
    try:
        resp = _post_json(url, fills_body)
        messages.append(f"saveFills 완료 — 신규 삽입 {resp.get('inserted', 0)}건")
    except Exception as e:
        enqueue_failed(queue_path, fills_body)
        messages.append(f"saveFills 실패(큐에 저장, 다음 실행 때 재시도): {e}")
        ok = False

    trades_body = build_trades_payload(trades)
    try:
        _post_json(url, trades_body)
        messages.append(f"saveTrades 완료 — {len(trades)}건 upsert")
    except Exception as e:
        enqueue_failed(queue_path, trades_body)
        messages.append(f"saveTrades 실패(큐에 저장, 다음 실행 때 재시도): {e}")
        ok = False

    return ok, messages
```

- [ ] **Step 3: `parse_args()`에 `--account` 옵션 추가**

`trade_sync.py:629-633`의 `parse_args()`를 교체:

```python
def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--backfill", help="YYYYMMDD — 이 날짜부터 강제 전체 재조회(최초 1회 또는 재검증용)")
    p.add_argument("--dry-run", action="store_true", help="Sheets/텔레그램 실제 기록 없이 콘솔에만 출력")
    p.add_argument("--account", choices=["me", "gf"], default="me", help="동기화할 계좌 (기본: me)")
    return p.parse_args()
```

- [ ] **Step 4: `main()`을 `account_config()` 사용하도록 수정**

`trade_sync.py:636-719`의 `main()`에서 아래 지점들을 수정:

1. `args.account`로 `cfg = account_config(args.account)`를 얻는다 (`start`/`end` 계산 로직 시작 부분에 추가).
2. `load_last_sync(last_sync["last_synced_date"] ...)` 호출부:
   ```python
   cfg = account_config(args.account)
   if args.backfill:
       start = datetime.strptime(args.backfill, "%Y%m%d").date()
   else:
       last_sync = load_last_sync(cfg["last_sync_path"])
       if not last_sync:
           print(f"{cfg['last_sync_path']}가 없습니다 — 최초 실행은 --backfill YYYYMMDD로 해주세요.")
           sys.exit(1)
       start = datetime.strptime(last_sync["last_synced_date"], "%Y%m%d").date()
   end = date.today()
   print(f"[{cfg['label']}] 동기화 구간: {start} ~ {end}")
   ```
3. `url = _env("APPS_SCRIPT_URL")` → `url = _env(cfg["apps_script_env"])`
4. `retry_queue(url)` → `retry_queue(cfg["queue_path"], url)`
5. `client = KiwoomClient(_env("KIWOOM_APPKEY"), _env("KIWOOM_SECRETKEY"))` → `client = KiwoomClient(_env(cfg["appkey_env"]), _env(cfg["secretkey_env"]))`
6. `open_lots, entry_seq = ({}, {}) if args.backfill else load_open_lots()` → `load_open_lots(cfg["open_lots_path"])`
7. `sync_to_sheets(url, all_fills, trades)` → `sync_to_sheets(url, cfg["queue_path"], all_fills, trades)`
8. `save_last_sync(end.strftime("%Y%m%d"))` → `save_last_sync(cfg["last_sync_path"], end.strftime("%Y%m%d"))`
9. `save_open_lots(new_open_lots, new_entry_seq)` → `save_open_lots(cfg["open_lots_path"], new_open_lots, new_entry_seq)`

`send_telegram(build_telegram_summary(...))` 두 호출부는 이 태스크에서 건드리지 않는다 — `build_telegram_summary`가 아직 7개 위치 인자짜리 기존 시그니처이므로, 지금 `cfg["label"]`을 끼워 넣으면 `ip_mismatch_error` 자리에 잘못 들어가는 버그가 생긴다. 시그니처 확장과 두 호출부 수정은 Task 3에서 원자적으로 함께 한다.

- [ ] **Step 5: 회귀 테스트 재실행**

Run: `python -m pytest test_trade_sync.py -v`
Expected: 전부 PASS (build_trades 관련 로직은 안 건드렸으므로 그대로 통과해야 함)

- [ ] **Step 6: `--dry-run`으로 `me` 계좌 수동 스모크 테스트 (하위호환 확인)**

Run (cwd `C:\Users\June`): `screener_venv\Scripts\python.exe trade_sync.py --dry-run`
Expected: 기존과 동일하게 `last_sync.json` 경로로 동기화 구간을 읽고 콘솔 리포트 출력 (에러 없이 완료)

- [ ] **Step 7: 커밋**

```bash
cd C:\Users\June
git add trade_sync.py
git commit -m "feat: parametrize trade_sync state paths and wire --account through main"
```

---

### Task 3: `trade_sync.py` — 텔레그램 요약에 계좌 라벨 표시

두 계좌가 같은 `TELEGRAM_CHAT_ID`로 알림을 보내므로, 메시지만 보고 어느 계좌인지 구분할 수 있어야 한다.

**Files:**
- Modify: `C:\Users\June\trade_sync.py:549-573` (`build_telegram_summary`)

**Interfaces:**
- Consumes: `account_config()`의 `label` 필드 (Task 1)
- Produces: `build_telegram_summary(start, end, all_fills, trades, sync_ok, sync_messages, queue_recovered, account_label, ip_mismatch_error=None)` — `account_label` 위치 인자 추가

- [ ] **Step 1: 실패하는 테스트 작성**

`test_trade_sync.py`에 추가:

```python
from trade_sync import build_telegram_summary


def test_telegram_summary_includes_account_label():
    msg = build_telegram_summary(
        "2026-07-01", "2026-07-08", [], [], True, [], 0, account_label="여자친구 계좌"
    )
    assert msg.startswith("🤖 [여자친구 계좌]")


def test_telegram_summary_ip_mismatch_includes_account_label():
    msg = build_telegram_summary(
        "2026-07-01", "2026-07-08", [], [], False, [], 0,
        account_label="여자친구 계좌", ip_mismatch_error="테스트 에러",
    )
    assert msg.startswith("🚫 [여자친구 계좌]")
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `python -m pytest test_trade_sync.py -k telegram_summary -v`
Expected: FAIL — `TypeError: build_telegram_summary() missing 1 required positional argument: 'account_label'`

- [ ] **Step 3: 구현 수정**

`trade_sync.py:549-573`의 `build_telegram_summary`를 교체:

```python
def build_telegram_summary(start, end, all_fills, trades, sync_ok, sync_messages, queue_recovered, account_label, ip_mismatch_error=None):
    if ip_mismatch_error:
        return (
            f"🚫 [{account_label}] 키움 매매일지 동기화 실패 — IP 불일치\n"
            f"{start}~{end} 구간 처리 못 함.\n"
            f"원인: {ip_mismatch_error}\n"
            f"키움 Open API 포털에서 현재 공인 IP로 앱키를 재등록한 뒤 수동으로 다시 실행해주세요."
        )

    lines = [f"🤖 [{account_label}] 키움 매매일지 동기화 {start}~{end}"]
    if queue_recovered:
        lines.append(f"이전 실패분 재전송 성공: {queue_recovered}건")

    if not all_fills:
        lines.append("이 구간 신규 체결 없음.")
    else:
        closed = [t for t in trades if t["status"] == "closed"]
        total_pl = sum(t["total_realized_pl"] for t in closed)
        lines.append(f"체결 {len(all_fills)}건 / trade {len(trades)}건(청산 {len(closed)}건)")
        lines.append(f"이 구간 총실현손익(청산 완료분): {total_pl:+,.0f}원")

    lines.extend(sync_messages)
    if not sync_ok:
        lines.append("⚠ 일부 실패 — 다음 실행 때 자동 재시도됩니다.")
    return "\n".join(lines)
```

`main()`의 두 `send_telegram(build_telegram_summary(...))` 호출부(671~674행, 716행)에 `cfg["label"]`을 위치 인자로 추가:

```python
send_telegram(build_telegram_summary(start, end, [], [], False, [], queue_recovered, cfg["label"], ip_mismatch_error=str(e)))
```
```python
send_telegram(build_telegram_summary(start, end, all_fills, trades, sync_ok, sync_messages, queue_recovered, cfg["label"]))
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `python -m pytest test_trade_sync.py -v`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
cd C:\Users\June
git add trade_sync.py test_trade_sync.py
git commit -m "feat: label telegram sync summary with account name"
```

---

### Task 4: 여자친구용 Google Sheet + Apps Script 배포 (수동, 사용자 작업)

이 태스크는 코드가 아니라 브라우저에서 사용자가 직접 해야 하는 작업이다. OAuth 로그인이 필요해 자동화할 수 없다.

- [ ] **Step 1: 기존 시트 복제**
  - 기존 매매일지 Google Sheet(`SHEETS_URL` — `index.html:533`에서 확인 가능, `docs.google.com/spreadsheets/d/1m1hGdh3Zy_YmWC59dz87V7gM-vcn_D4e5_iuQEmecME`)를 연다.
  - 파일 > 사본 만들기로 복제. 이름은 "매매일지 (여자친구)" 등으로 구분되게 짓는다.
  - 복제된 시트에서 `fills`, `trades`, `capital` 탭만 남기고 `Plans`, `premarket_checks` 탭은 삭제한다 (여자친구 쪽에서 안 쓰는 기능).
  - 각 탭의 헤더 행(1행)은 그대로 두고, 데이터 행(2행부터)은 전부 지운다 — 내 매매 데이터가 섞여 들어가면 안 되므로.

- [ ] **Step 2: Apps Script 바인딩 및 배포**
  - 복제된 시트에서 확장 프로그램 > Apps Script를 연다.
  - 기본 생성된 `Code.gs` 내용을 전부 지우고, `C:\Users\June\jb-journal\apps-script\Code.gs` 파일 내용을 그대로 붙여넣는다 (무수정 — 이 파일이 시트 이름으로 탭을 찾으므로 탭 이름만 맞으면 그대로 동작한다).
  - 저장 후 배포 > 새 배포 > 유형: 웹 앱.
    - 실행 계정: 나(배포자)
    - 액세스 권한: 링크가 있는 모든 사용자
  - 배포 완료 후 나오는 웹 앱 URL을 복사한다.

- [ ] **Step 3: `.env`에 URL 추가**
  - `C:\Users\June\.env`를 열어서 아래 줄을 추가한다 (Task 1에서 만든 `account_config`가 이 이름을 기대함):
    ```
    APPS_SCRIPT_URL_GF=방금_복사한_웹앱_URL
    ```

- [ ] **Step 4: 동작 확인**

Run (cwd `C:\Users\June`): `screener_venv\Scripts\python.exe trade_sync.py --account gf --dry-run`
Expected: `[여자친구 계좌] 동기화 구간: ...` 출력 후 `last_sync_gf.json`이 없다는 안내와 함께 종료 (정상 — 아직 backfill 전이므로). `APPS_SCRIPT_URL_GF missing` 에러가 안 뜨면 env var 연결 성공.

- [ ] **Step 5: 최초 백필 실행 (여자친구 본인 확인 하에)**

Run: `screener_venv\Scripts\python.exe trade_sync.py --account gf --backfill <여자친구가_원하는_시작일YYYYMMDD> --dry-run`으로 먼저 콘솔 리포트를 보여주고, 숫자가 맞는지 여자친구 본인이 영웅문 HTS와 대조 확인한 뒤 `--dry-run` 없이 재실행해서 실제로 Sheets에 기록한다.

---

### Task 5: 여자친구 계좌 무인 동기화 스케줄링

기존 `JB_TradeSync` 작업(평일 20:10 KST, `C:\Users\June\auto_trade_sync.bat` 실행)과 동일한 패턴으로 하나 더 만든다.

**Files:**
- Create: `C:\Users\June\auto_trade_sync_gf.bat`

- [ ] **Step 1: `.bat` 파일 생성**

`C:\Users\June\auto_trade_sync.bat`을 참고해 다음 내용으로 작성:

```bat
@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\June
if not exist logs mkdir logs
echo ==== %date% %time% (GF) ==== >> logs\auto_trade_sync_gf.log
C:\Users\June\screener_venv\Scripts\python.exe trade_sync.py --account gf >> logs\auto_trade_sync_gf.log 2>&1
```

- [ ] **Step 2: schtasks 등록**

기존 `JB_TradeSync` 작업과 동일 시간대(평일 20:10)로 등록 — 실행 전 사용자에게 등록해도 되는지 확인한다(스케줄링된 작업 생성은 시스템 상태 변경).

```powershell
schtasks /create /tn "JB_TradeSync_GF" /tr "C:\Users\June\auto_trade_sync_gf.bat" /sc weekly /d MON,TUE,WED,THU,FRI /st 20:10 /rl LIMITED
```

- [ ] **Step 3: 등록 확인**

Run: `schtasks /query /tn "JB_TradeSync_GF" /v /fo list` (또는 PowerShell `Get-ScheduledTask -TaskName "JB_TradeSync_GF"`)
Expected: `Ready` 상태로 등록 확인, 트리거가 평일 20:10인지 확인

---

### Task 6: `index.html` — 히스토리 탭 2단 마크업 + CSS

**Files:**
- Modify: `C:\Users\June\jb-journal\index.html:413-440` (탭3 마크업), CSS `<style>` 블록 (147~148행 부근 `.stat-grid`/`.summary-grid` 정의 근처)

**Interfaces:**
- Produces: DOM id 세트 `{stat-grid,summary-grid,hist-list,capital-total-display,capital-date,capital-amount,capital-note}-me`와 `-gf` (Task 7이 이 id들을 참조)

- [ ] **Step 1: CSS에 2단 그리드 클래스 추가**

`index.html`의 `<style>` 블록에서 `.stat-grid { ... }` 정의(147행) 바로 앞에 추가:

```css
.hist-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.hist-column-label { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 8px; padding: 0 2px; }
@media (max-width: 640px) {
  .hist-columns { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: 탭3(`tab-history`) 마크업을 2단 구조로 교체**

`index.html:413-440`을 다음으로 교체:

```html
<div id="tab-history" class="tab-content">
  <div class="page-title">매매내역</div>

  <div class="hist-columns">
    <div>
      <div class="hist-column-label">내 계좌</div>
      <div class="section" style="padding:10px 14px;">
        <div class="section-title">입출금 기록</div>
        <div class="row2">
          <div><label>날짜</label><input type="date" id="capital-date-me"></div>
          <div><label>금액(원, 출금은 음수)</label><input type="number" id="capital-amount-me" placeholder="4000000"></div>
        </div>
        <div style="margin-top:8px;">
          <label>메모 (선택)</label><input type="text" id="capital-note-me" placeholder="예: 초기 입금">
        </div>
        <button type="button" class="save-btn" style="margin-top:10px;" onclick="addCapitalEntry('me')">입출금 추가</button>
        <div style="margin-top:10px;font-size:13px;color:var(--muted);" id="capital-total-display-me"></div>
      </div>
      <div class="stat-grid" id="stat-grid-me"></div>
      <div class="section" style="padding:10px 14px;">
        <div class="section-title">최근 9건 요약</div>
        <div class="summary-grid" id="summary-grid-me"></div>
      </div>
      <div class="section" style="padding:10px 14px;">
        <div class="section-title">최근 거래</div>
        <div id="hist-list-me"></div>
      </div>
    </div>

    <div>
      <div class="hist-column-label">여자친구 계좌</div>
      <div class="section" style="padding:10px 14px;">
        <div class="section-title">입출금 기록</div>
        <div class="row2">
          <div><label>날짜</label><input type="date" id="capital-date-gf"></div>
          <div><label>금액(원, 출금은 음수)</label><input type="number" id="capital-amount-gf" placeholder="4000000"></div>
        </div>
        <div style="margin-top:8px;">
          <label>메모 (선택)</label><input type="text" id="capital-note-gf" placeholder="예: 초기 입금">
        </div>
        <button type="button" class="save-btn" style="margin-top:10px;" onclick="addCapitalEntry('gf')">입출금 추가</button>
        <div style="margin-top:10px;font-size:13px;color:var(--muted);" id="capital-total-display-gf"></div>
      </div>
      <div class="stat-grid" id="stat-grid-gf"></div>
      <div class="section" style="padding:10px 14px;">
        <div class="section-title">최근 9건 요약</div>
        <div class="summary-grid" id="summary-grid-gf"></div>
      </div>
      <div class="section" style="padding:10px 14px;">
        <div class="section-title">최근 거래</div>
        <div id="hist-list-gf"></div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 브라우저에서 마크업/레이아웃 수동 확인**

`index.html`을 브라우저로 열고 "매매내역" 탭 클릭.
Expected: 두 컬럼("내 계좌"/"여자친구 계좌" 라벨)이 PC 폭에서 좌우로 나란히 보임(내용은 아직 비어있어도 됨 — JS 연결은 Task 7에서). 개발자도구로 폭을 640px 이하로 줄이면 위아래로 쌓이는지 확인.

- [ ] **Step 4: 커밋**

```bash
cd C:\Users\June\jb-journal
git add index.html
git commit -m "feat: add two-column markup and CSS for dual-account history tab"
```

---

### Task 7: `index.html` — JS 상태를 계좌별로 파라미터화 (매매내역/통계)

**Files:**
- Modify: `C:\Users\June\jb-journal\index.html:530-548` (전역 상태), `:1246-1412` (히스토리 로드/렌더), `:1449-1496` (자동거래 편집 모달), `:1504-1514` (초기화)

**Interfaces:**
- Consumes: Task 6의 DOM id들 (`-me`/`-gf` 접미사)
- Produces: `ACCOUNTS` 전역 객체, `loadAutoTrades(acct)`, `getMergedHistory(acct)`, `renderHistory(acct)` — Task 8이 재사용

- [ ] **Step 1: 전역 상태를 `ACCOUNTS` 객체로 교체**

`index.html:532-533` (APPS_SCRIPT_URL/SHEETS_URL 상수) 바로 아래, 546~548행(`autoTrades`/`capitalHistory`/`autoEditTradeId` 선언)을 다음으로 교체:

```javascript
const APPS_SCRIPT_URL_GF = 'YOUR_GF_APPS_SCRIPT_URL'; // Task 4에서 배포 후 실제 URL로 교체
const ACCOUNTS = {
  me: { url: APPS_SCRIPT_URL, autoTrades: [], capitalHistory: [] },
  gf: { url: APPS_SCRIPT_URL_GF, autoTrades: [], capitalHistory: [] },
};
let autoEditAccount = null;   // 자동 카드 수동 입력 모달이 어느 계좌 것인지
let autoEditTradeId = null;   // 자동 카드 수동 입력 모달에 열린 tradeId
```

(`APPS_SCRIPT_URL`/`SHEETS_URL` 기존 상수 2줄은 그대로 둔다.)

- [ ] **Step 2: `loadAutoTrades`/`loadCapitalHistory`/`addCapitalEntry`를 계좌 인자 방식으로 교체**

`index.html:1252-1285`를 교체:

```javascript
function loadAutoTrades(acct) {
  const cfg = ACCOUNTS[acct];
  if (!cfg.url || cfg.url === 'YOUR_GF_APPS_SCRIPT_URL') { renderHistory(acct); return; }
  fetch(`${cfg.url}?action=getTrades`)
    .then(r => r.json())
    .then(data => { cfg.autoTrades = data || []; renderHistory(acct); })
    .catch(() => { /* 자동 동기화 실패해도 수동 내역은 정상 표시되어야 함 */ });
}

function loadCapitalHistory(acct) {
  const cfg = ACCOUNTS[acct];
  if (!cfg.url || cfg.url === 'YOUR_GF_APPS_SCRIPT_URL') { renderHistory(acct); return; }
  fetch(`${cfg.url}?action=getCapital`)
    .then(r => r.json())
    .then(data => { cfg.capitalHistory = data || []; renderHistory(acct); })
    .catch(() => {});
}

function addCapitalEntry(acct) {
  const cfg = ACCOUNTS[acct];
  const date = document.getElementById(`capital-date-${acct}`).value;
  const amount = parseFloat(document.getElementById(`capital-amount-${acct}`).value);
  const note = document.getElementById(`capital-note-${acct}`).value.trim();
  if (!date || !amount) { showToast('날짜와 금액을 입력하세요.'); return; }
  fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ type: 'saveCapital', date, amount, note })
  })
    .then(r => r.json())
    .then(resp => {
      if (resp.result !== 'OK') throw new Error(resp.result);
      document.getElementById(`capital-amount-${acct}`).value = '';
      document.getElementById(`capital-note-${acct}`).value = '';
      showToast('✅ 입출금 기록 완료!');
      loadCapitalHistory(acct);
    })
    .catch(() => showToast('❌ 입출금 저장 실패 — 다시 시도해주세요.'));
}
```

- [ ] **Step 3: `normalizeAutoTrade`/`getMergedHistory`/`renderHistory`를 계좌 인자 방식으로 교체**

`index.html:1287-1412`를 교체 (내부 로직은 기존과 동일, `autoTrades`/`capitalHistory` 참조를 `ACCOUNTS[acct]`로, DOM id를 `${id}-${acct}`로, `me` 계좌만 수동 내역(`loadHistory()`/localStorage)을 병합):

```javascript
function normalizeAutoTrade(t) {
  const sells = (t.sells || []).map(s => ({
    date: s.ord_dt ? `${s.ord_dt.slice(0,4)}-${s.ord_dt.slice(4,6)}-${s.ord_dt.slice(6,8)}` : '',
    price: s.price, qty: s.qty,
    memo: s.tax_fee ? `세금${Math.round(s.tax_fee.tax).toLocaleString('ko-KR')} 수수료${Math.round(s.tax_fee.commission).toLocaleString('ko-KR')}` : ''
  }));
  const lastSell = sells[sells.length - 1];
  const verdict = t.winLoss === '승' ? 'win' : (t.winLoss === '패' ? 'lose' : (t.totalPl >= 0 ? 'win' : 'lose'));
  return {
    id: t.tradeId, source: 'auto', name: t.stkNm, code: t.stkCd,
    date: lastSell ? lastSell.date : '',
    status: t.status === 'closed' ? (t.totalPl >= 0 ? '수익' : '손절') : '보유중(부분매도)',
    profit: t.totalPl || 0,
    rate: (t.totalReturnPct || 0) / 100,
    tax: (t.sells || []).reduce((s, x) => s + (x.tax_fee ? x.tax_fee.tax : 0), 0),
    verdict, sells, manual: t.manual || {},
    excluded: !!(t.manual && (t.manual.제외 === true || t.manual.제외 === 'true')),
  };
}

function getMergedHistory(acct) {
  const cfg = ACCOUNTS[acct];
  const auto = cfg.autoTrades.filter(t => (t.sells || []).length > 0).map(normalizeAutoTrade);
  if (acct !== 'me') {
    return auto.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  // 자동 동기화가 커버하는 가장 이른 날짜 이후의 수동(✍️) 기록은 자동 기록과 같은 실거래를
  // 중복으로 담고 있을 가능성이 높다 — 그 구간의 수동 기록은 통계에서 제외해서 이중 집계를 막는다.
  const autoMinDate = auto.reduce((min, a) => (a.date && (!min || a.date < min)) ? a.date : min, null);
  const manual = loadHistory()
    .map(h => ({ ...h, source: 'manual' }))
    .filter(h => !autoMinDate || !h.date || h.date < autoMinDate);
  return [...manual, ...auto].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function renderHistory(acct) {
  const cfg = ACCOUNTS[acct];
  const totalCapital = cfg.capitalHistory.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const capDisplay = document.getElementById(`capital-total-display-${acct}`);
  if (capDisplay) capDisplay.textContent = `누적 투입원금: ${totalCapital.toLocaleString('ko-KR')}원 (입출금 ${cfg.capitalHistory.length}건)`;

  const hist = getMergedHistory(acct);
  const grid = document.getElementById(`stat-grid-${acct}`);
  const list = document.getElementById(`hist-list-${acct}`);

  if (!hist.length) {
    grid.innerHTML = '';
    document.getElementById(`summary-grid-${acct}`).innerHTML = '';
    list.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px 0;">아직 기록이 없습니다.</div>';
    return;
  }

  const statsHist = hist.filter(h => !h.excluded);
  if (!statsHist.length) {
    grid.innerHTML = '';
    document.getElementById(`summary-grid-${acct}`).innerHTML = '';
  }

  const total = statsHist.reduce((s,h)=>s+h.profit, 0);
  const wins  = statsHist.filter(h => h.verdict ? h.verdict === 'win' : h.profit >= 0).length;
  const losses = statsHist.length - wins;
  const rate  = statsHist.length ? (wins/statsHist.length*100).toFixed(0) : '0';
  const avgR  = statsHist.length ? (statsHist.reduce((s,h)=>s+h.rate,0)/statsHist.length*100).toFixed(2) : '0.00';
  const capRate = totalCapital > 0 ? (total / totalCapital * 100).toFixed(2) : null;
  const rateLabel = totalCapital > 0 ? '자본 기준 수익률' : '평균 수익률';
  const rateVal = totalCapital > 0 ? capRate : avgR;

  if (statsHist.length) grid.innerHTML = `
    <div class="stat-card"><div class="stat-label">총 수익금</div><div class="stat-val ${total>=0?'green':'red'}">${total>=0?'+':''}${total.toLocaleString('ko-KR')}원</div></div>
    <div class="stat-card"><div class="stat-label">승률</div><div class="stat-val ${wins/statsHist.length>=0.5?'green':'red'}">${rate}%</div><div class="stat-sub">${wins}승 ${losses}패</div></div>
    <div class="stat-card"><div class="stat-label">거래 수</div><div class="stat-val">${statsHist.length}건</div></div>
    <div class="stat-card"><div class="stat-label">${rateLabel}</div><div class="stat-val ${rateVal>=0?'green':'red'}">${rateVal>=0?'+':''}${rateVal}%</div></div>`;

  document.getElementById(`summary-grid-${acct}`).innerHTML = statsHist.slice(0, 9).map(h => {
    const isWin = h.verdict ? h.verdict === 'win' : h.profit >= 0;
    const rateClass = isWin ? 'green' : 'red';
    const sRate = (h.rate * 100).toFixed(2);
    return `
    <div class="summary-cell">
      <div class="sc-name">${h.name}</div>
      <div class="sc-rate ${rateClass}">${sRate>=0?'+':''}${sRate}%</div>
      <div class="sc-verdict ${rateClass}">${isWin?'승':'패'}</div>
    </div>`;
  }).join('');

  list.innerHTML = hist.map(h => {
    const isWin = h.verdict ? h.verdict === 'win' : h.profit >= 0;
    const sellLines = (h.sells || []).map(s => {
      const tag = h.use2 ? (s.phase === 2 ? ' <span style="color:var(--orange);">[평단]</span>' : ' <span style="color:var(--blue);">[1차]</span>') : '';
      const tierBadge = s.tag ? ` <span style="color:var(--accent);">[${s.tag}]</span>` : '';
      const memo = s.memo ? ` — ${s.memo}` : '';
      return `<div class="hist-meta">${s.date} · ${(s.price || 0).toLocaleString('ko-KR')}원 × ${s.qty}주${tag}${tierBadge}${memo}</div>`;
    }).join('');

    const badge = h.source === 'auto' ? '🤖 ' : '✍️ ';
    const actionBtns = h.source === 'manual'
      ? `<button class="hist-edit" onclick="openEditModal(${h.id})">✎</button>
         <button class="hist-del" onclick="deleteHistory(${h.id})">✕</button>`
      : `<button class="hist-edit" onclick="openAutoEditModal('${acct}','${h.id}')">✎</button>`;
    const includeToggle = h.source === 'auto'
      ? `<label class="hist-include-toggle" title="승패 통계에 포함">
           <input type="checkbox" ${h.excluded ? '' : 'checked'} onchange="toggleTradeIncluded('${acct}','${h.id}', !this.checked)"> 통계 포함
         </label>`
      : '';

    return `
    <div class="hist-item" ${h.excluded ? 'style="opacity:0.5;"' : ''}>
      <div class="hist-left">
        <div class="hist-name">${badge}${h.name}${h.code?` <span style="font-size:11px;color:var(--muted);">${h.code}</span>`:''}${h.excluded ? ' <span style="color:var(--muted);font-size:11px;">(통계 제외)</span>' : ''}</div>
        <div class="hist-meta">${h.date} · ${h.status}${h.sells && h.sells.length > 1 ? ` · ${h.sells.length}건 분할매도` : ''}</div>
        ${sellLines}
        ${includeToggle}
      </div>
      <div class="hist-right">
        <div class="hist-verdict ${isWin?'green':'red'}">${isWin?'승':'패'}</div>
        <div class="hist-profit ${h.profit>=0?'green':'red'}">${h.profit>=0?'+':''}${h.profit.toLocaleString('ko-KR')}원</div>
        <div class="hist-rate">${(h.rate*100)>=0?'+':''}${(h.rate*100).toFixed(2)}%</div>
        ${h.tax > 0 ? `<div class="hist-tax">세금 -${h.tax.toLocaleString('ko-KR')}원</div>` : ''}
      </div>
      ${actionBtns}
    </div>`;
  }).join('');
}
```

`deleteHistory`(1249행)는 `me` 전용 수동 삭제라 수정 없음, 단 `renderHistory()` 호출부만 `renderHistory('me')`로 수정:
```javascript
function deleteHistory(id) { saveHistory(loadHistory().filter(h=>h.id!==id)); renderHistory('me'); }
```

- [ ] **Step 4: `toggleTradeIncluded`/`openAutoEditModal`/`saveAutoTradeManual`을 계좌 인자 방식으로 교체**

`index.html:1414-1496`을 교체:

```javascript
function toggleTradeIncluded(acct, tradeId, excluded) {
  const cfg = ACCOUNTS[acct];
  const t = cfg.autoTrades.find(x => String(x.tradeId) === String(tradeId));
  if (!t) return;
  const prevManual = t.manual || {};
  t.manual = { ...prevManual, 제외: excluded };
  renderHistory(acct);

  const body = {
    type: 'updateTradeManual', tradeId,
    차수: prevManual.차수 || '', 손절청산사유: prevManual.손절청산사유 || '',
    규칙준수: prevManual.규칙준수 || '', 테마: prevManual.테마 || '', 메모: prevManual.메모 || '',
    제외: excluded,
  };
  fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body)
  })
    .then(r => r.json())
    .then(resp => {
      if (!resp || resp.result !== 'OK') {
        t.manual = prevManual;
        renderHistory(acct);
        showToast('❌ 저장 실패 — 다시 시도해주세요.');
      }
    })
    .catch(() => {
      t.manual = prevManual;
      renderHistory(acct);
      showToast('❌ 저장 실패 — 다시 시도해주세요.');
    });
}

function openAutoEditModal(acct, tradeId) {
  const t = ACCOUNTS[acct].autoTrades.find(x => String(x.tradeId) === String(tradeId));
  if (!t) return;
  autoEditAccount = acct;
  autoEditTradeId = tradeId;
  const m = t.manual || {};
  document.getElementById('auto-edit-차수').value = m.차수 || '';
  document.getElementById('auto-edit-손절청산사유').value = m.손절청산사유 || '';
  document.getElementById('auto-edit-규칙준수').value = m.규칙준수 || '';
  document.getElementById('auto-edit-테마').value = m.테마 || '';
  document.getElementById('auto-edit-메모').value = m.메모 || '';
  document.getElementById('auto-edit-modal').classList.add('show');
}

function closeAutoEditModal() {
  document.getElementById('auto-edit-modal').classList.remove('show');
  autoEditAccount = null;
  autoEditTradeId = null;
}

function saveAutoTradeManual() {
  if (!autoEditTradeId || !autoEditAccount) return;
  const cfg = ACCOUNTS[autoEditAccount];
  const t = cfg.autoTrades.find(x => String(x.tradeId) === String(autoEditTradeId));
  const prevManual = (t && t.manual) || {};
  const body = {
    type: 'updateTradeManual', tradeId: autoEditTradeId,
    차수: document.getElementById('auto-edit-차수').value.trim(),
    손절청산사유: document.getElementById('auto-edit-손절청산사유').value.trim(),
    규칙준수: document.getElementById('auto-edit-규칙준수').value.trim(),
    테마: document.getElementById('auto-edit-테마').value.trim(),
    메모: document.getElementById('auto-edit-메모').value.trim(),
    제외: prevManual.제외 === true || prevManual.제외 === 'true',
  };
  fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body)
  })
    .then(r => r.json())
    .then(resp => {
      if (resp.result !== 'OK') throw new Error(resp.result);
      showToast('✅ 저장 완료!');
      const acct = autoEditAccount;
      closeAutoEditModal();
      loadAutoTrades(acct);
    })
    .catch(() => showToast('❌ 저장 실패 — 네트워크를 확인하고 다시 시도해주세요.'));
}
```

- [ ] **Step 5: 초기화 코드에서 두 계좌 모두 로드하도록 수정**

`index.html:1504-1514`의 `DOMContentLoaded` 리스너를 교체:

```javascript
window.addEventListener('DOMContentLoaded', ()=>{
  const urlEl = document.getElementById('sheets-url-display');
  if (urlEl) urlEl.textContent = SHEETS_URL;
  document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
  renderThemePills();
  initPlans();
  loadPremarketCheck();
  loadAutoTrades('me');
  loadCapitalHistory('me');
  loadAutoTrades('gf');
  loadCapitalHistory('gf');
});
```

- [ ] **Step 6: 브라우저 수동 검증**

`index.html`을 브라우저로 열고 매매내역 탭 확인.
Expected:
- 왼쪽(내 계좌) 컬럼: 기존과 동일하게 실데이터가 뜬다 (회귀 없음 확인 — 가장 중요).
- 오른쪽(여자친구 계좌) 컬럼: `APPS_SCRIPT_URL_GF`가 아직 `'YOUR_GF_APPS_SCRIPT_URL'` 플레이스홀더면 "아직 기록이 없습니다"로 조용히 빈 상태 표시(에러 없음).
- 개발자도구 콘솔에 에러 없는지 확인.
- Task 4가 완료된 뒤라면 `APPS_SCRIPT_URL_GF`를 실제 URL로 바꾸고 다시 열어서 여자친구 쪽 실데이터도 뜨는지 확인.

- [ ] **Step 7: 커밋**

```bash
cd C:\Users\June\jb-journal
git add index.html
git commit -m "feat: parametrize history rendering by account for dual-account view"
```

---

### Task 8: `index.html` — `APPS_SCRIPT_URL_GF` 실제 값 반영 (Task 4 완료 후)

**Files:**
- Modify: `C:\Users\June\jb-journal\index.html` (Task 7에서 추가한 `APPS_SCRIPT_URL_GF` 상수)

- [ ] **Step 1: Task 4에서 받은 실제 배포 URL로 교체**

`index.html`의 `const APPS_SCRIPT_URL_GF = 'YOUR_GF_APPS_SCRIPT_URL';`을 실제 URL로 교체.

- [ ] **Step 2: 브라우저에서 최종 확인**

매매내역 탭을 열어 두 컬럼 모두 실데이터(또는 정상적인 빈 상태)가 뜨는지, 자동거래 편집 모달이 양쪽 계좌에서 각각 올바른 계좌의 데이터를 수정하는지(한쪽 수정이 다른 쪽에 영향 없는지) 확인.

- [ ] **Step 3: 커밋 및 배포**

```bash
cd C:\Users\June\jb-journal
git add index.html
git commit -m "feat: wire gf apps script deployment url"
git push origin main
```

`main` 브랜치 push가 곧 GitHub Pages 배포이므로, push 직후 `https://newcro761-rgb.github.io/jb-journal/`에서 실제로 반영됐는지 확인한다.

---

## 실행 순서 요약

1. Task 1~3 (trade_sync.py 코드) → Task 2 완료 시점부터 `--account gf --dry-run`을 실제로 실행해볼 수 있음
2. Task 4 (수동: Google Sheet/Apps Script 배포) — 이 태스크 완료 전까지 Task 6/7은 진행 가능하지만 실데이터 검증은 불가
3. Task 5 (스케줄링) — Task 4 완료 후
4. Task 6~7 (index.html 마크업+JS) — Task 4와 병행 가능
5. Task 8 (실제 URL 반영 + 배포) — Task 4, 7 둘 다 끝난 뒤 마지막
