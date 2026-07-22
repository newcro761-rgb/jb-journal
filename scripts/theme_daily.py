"""매일 장마감 후 8%+ 급등 종목을 Anthropic API로 테마별 그룹핑해 jb-journal에 저장.

FinanceDataReader 전종목 스냅샷(오늘 조회 시 정확값) + 네이버금융 뉴스 헤드라인을
근거로 Claude가 테마명과 종목별 메모를 생성한다. GitHub Actions에서 평일 KST 19:30
(장마감+정산 이후) 실행.
"""
import argparse
import io
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

# Windows 로컬 실행 시 cp949 기본 콘솔 인코딩이 이모지/한글 출력에서 깨지는 것 방지
# (GitHub Actions ubuntu-latest는 기본 UTF-8이라 영향 없음)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import anthropic
import FinanceDataReader as fdr
import requests
from bs4 import BeautifulSoup

from premarket_check import KST, is_kr_market_holiday, kst_now

BULL_RATE_THRESHOLD_PCT = 8.0
MIN_PRICE = 1_000
NEWS_PER_STOCK = 5
NEWS_WORKERS = 10
MODEL = "claude-sonnet-5"

H_NAVER = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://finance.naver.com",
}

DRY_RUN = False


def _env(name):
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"missing required env var: {name}")
    return val


def send_telegram(text):
    if DRY_RUN:
        print("=== TELEGRAM (dry-run) ===")
        print(text)
        return
    token = _env("TELEGRAM_BOT_TOKEN")
    chat_id = _env("TELEGRAM_CHAT_ID")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    for i in range(0, len(text), 4000):
        chunk = text[i:i + 4000]
        r = requests.post(url, data={"chat_id": chat_id, "text": chunk}, timeout=15)
        r.raise_for_status()


# ── 종목 유니버스 + 블랙리스트 (JB_Screening/screener_60d_v2.py와 동일 로직 —
#    별도 저장소라 import 불가, 인라인 복붙. 컬럼명/필터 조건을 바꾸면 두 파일 다 고칠 것) ──
def build_universe(listing_df):
    df = listing_df[listing_df['Market'].isin(['KOSPI', 'KOSDAQ', 'KOSDAQ GLOBAL'])].copy()
    df = df[df['Dept'] != 'SPAC(소속부없음)']
    df = df[df['Code'].astype(str).str.endswith('0')]
    return df


def fetch_codes(url):
    try:
        r = requests.get(url, headers=H_NAVER, timeout=10)
        r.encoding = 'euc-kr'
        return set(re.findall(r'code=(\d{6})', r.text))
    except Exception:
        return set()


def build_blacklist():
    bl = fetch_codes('https://finance.naver.com/sise/management.naver')
    bl |= fetch_codes('https://finance.naver.com/sise/investment_alert.naver?type=warning')
    bl |= fetch_codes('https://finance.naver.com/sise/investment_alert.naver?type=danger')
    bl |= fetch_codes('https://finance.naver.com/sise/trading_halt.naver')
    return bl


def find_theme_candidates(universe, blacklist):
    """스크린샷의 실제 습관대로 거래대금/시가총액 하한선 없이 8%+ 양봉 전부를 담는다
    (기존 상승장(0186) 로직의 2000억 하한선과는 다른 조건)."""
    u = universe[
        (universe['ChagesRatio'] >= BULL_RATE_THRESHOLD_PCT)
        & (universe['Close'] > universe['Open'])
        & (universe['Close'] >= MIN_PRICE)
        & (~universe['Code'].isin(blacklist))
    ]
    rows = [{
        'code': str(r['Code']), 'name': r['Name'],
        'rate': round(float(r['ChagesRatio']), 2),
        'close': int(r['Close']),
        'amount_eok': round(float(r['Amount']) / 1e8, 1),
    } for _, r in u.iterrows()]
    rows.sort(key=lambda x: x['amount_eok'], reverse=True)
    return rows


# ── 네이버금융 뉴스 헤드라인 ──
def fetch_headlines(code):
    """종목 뉴스탭(item/news_news.naver)에서 최근 헤드라인 몇 개를 가져온다.
    Referer 헤더가 없으면 서버가 빈 결과("검색된 관련뉴스가 없습니다")를 주므로 필수."""
    try:
        r = requests.get(
            "https://finance.naver.com/item/news_news.naver",
            params={"code": code, "page": 1}, headers=H_NAVER, timeout=10,
        )
        r.encoding = "euc-kr"
        soup = BeautifulSoup(r.text, "html.parser")
        titles = []
        for a in soup.select("table.type5 td.title a.tit"):
            t = a.get_text(strip=True)
            if t and t not in titles:
                titles.append(t)
            if len(titles) >= NEWS_PER_STOCK:
                break
        return titles
    except Exception:
        return []


# ── Anthropic API — 테마 그룹핑 ──
THEME_SCHEMA = {
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "theme": {
                        "type": "string",
                        "description": "간결한 한국어 테마/섹터명. 예: '반도체후공정', '3대메가프로젝트/전력설비'"
                    },
                    "stocks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "code": {"type": "string"},
                                "name": {"type": "string"},
                                "memo": {
                                    "type": "string",
                                    "description": "종목별 한 줄 메모(15자 내외), 오늘 급등 근거"
                                }
                            },
                            "required": ["code", "name", "memo"],
                            "additionalProperties": False
                        }
                    }
                },
                "required": ["theme", "stocks"],
                "additionalProperties": False
            }
        }
    },
    "required": ["groups"],
    "additionalProperties": False
}

SYSTEM_PROMPT = """당신은 한국 주식시장 테마주 분석가입니다.
오늘 8% 이상 급등한 종목 목록과 각 종목의 최근 뉴스 헤드라인이 주어집니다.

규칙:
- 유사한 테마/섹터끼리 종목을 그룹핑하세요. 그룹명은 간결한 한국어로 짓습니다
  (예: "반도체후공정", "3대메가프로젝트/전력설비", "AI데이터센터").
- 여러 테마가 겹치면 슬래시(/)로 묶어 하나의 그룹명을 만드세요.
- 헤드라인이 비어있거나 근거가 약한 종목은 종목명만으로 최대한 추정하고,
  정 근거가 없으면 "개별 이슈" 그룹으로 묶으세요.
- 입력된 모든 종목은 정확히 하나의 그룹에 속해야 합니다 (누락 금지).
- memo는 종목명을 반복하지 말고 급등 근거를 15자 내외로 압축하세요."""


def classify_themes(candidates_with_news, client, max_tokens=8000, _retried=False):
    user_payload = json.dumps([
        {"code": c["code"], "name": c["name"], "rate": c["rate"], "headlines": c["headlines"]}
        for c in candidates_with_news
    ], ensure_ascii=False)

    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        output_config={"format": {"type": "json_schema", "schema": THEME_SCHEMA}},
        messages=[{"role": "user", "content": user_payload}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError(f"Claude refused: {response.stop_details}")
    if response.stop_reason == "max_tokens":
        if _retried:
            raise RuntimeError(f"Claude output truncated even after retry (max_tokens={max_tokens})")
        return classify_themes(candidates_with_news, client, max_tokens=max_tokens * 2, _retried=True)
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)["groups"]


def merge_groups(groups, candidates_by_code):
    """숫자/이름 환각 방지 — Claude가 반환한 code로 원본 스캔 데이터를 찾아
    name/rate/close/amount_eok를 전부 원본값으로 덮어쓰고, memo만 Claude 값을 쓴다."""
    merged_groups = []
    for g in groups:
        merged_stocks = []
        for s in g["stocks"]:
            orig = candidates_by_code.get(s.get("code"))
            if orig is None:
                continue  # Claude가 존재하지 않는 코드를 만들어냈으면 버림
            merged_stocks.append({
                "code": orig["code"], "name": orig["name"], "memo": s.get("memo", ""),
                "rate": orig["rate"], "close": orig["close"], "amount_eok": orig["amount_eok"],
            })
        if merged_stocks:
            merged_groups.append({"theme": g["theme"], "stocks": merged_stocks})
    return merged_groups


# ── Apps Script POST ──
def post_theme_result(payload):
    if DRY_RUN:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    url = _env("APPS_SCRIPT_URL")
    body = {"type": "theme-save", **payload}
    r = requests.post(
        url, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "text/plain;charset=UTF-8"}, timeout=20,
    )
    r.raise_for_status()
    if r.json().get("result") != "OK":
        raise RuntimeError(f"theme-save did not return OK: {r.text}")


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--asof", help="YYYY-MM-DD — 라벨/파일명용 날짜 override "
                                   "(FDR이 과거일자 스냅샷을 지원하지 않아 실제 재조회는 안 됨)")
    p.add_argument("--dry-run", action="store_true", help="Apps Script POST 대신 콘솔 출력")
    return p.parse_args()


def main():
    global DRY_RUN
    args = parse_args()
    DRY_RUN = args.dry_run
    run_dt = datetime.strptime(args.asof, "%Y-%m-%d").replace(tzinfo=KST) if args.asof else kst_now()

    if is_kr_market_holiday(run_dt):
        print(f"{run_dt.date()} — KR market holiday/weekend, skipping.")
        return

    date_str = run_dt.strftime("%Y-%m-%d")

    try:
        listing = fdr.StockListing('KRX')
        universe = build_universe(listing)
        blacklist = build_blacklist()
        candidates = find_theme_candidates(universe, blacklist)
        print(f"오늘 8%+ 양봉 후보: {len(candidates)}종목")

        if not candidates:
            # 후보가 없어도 groups:[]로 POST — 안 하면 탭에 어제 데이터가 stale하게 남는다
            post_theme_result({
                "date": date_str, "generatedAt": run_dt.isoformat(),
                "model": MODEL, "stockCount": 0, "groups": [],
            })
            print("완료: 급등주 없음")
            return

        with ThreadPoolExecutor(max_workers=NEWS_WORKERS) as ex:
            headlines = dict(zip(
                (c["code"] for c in candidates),
                ex.map(fetch_headlines, (c["code"] for c in candidates)),
            ))
        for c in candidates:
            c["headlines"] = headlines.get(c["code"], [])

        client = anthropic.Anthropic()
        groups = classify_themes(candidates, client)
        candidates_by_code = {c["code"]: c for c in candidates}
        groups = merge_groups(groups, candidates_by_code)

        post_theme_result({
            "date": date_str, "generatedAt": run_dt.isoformat(),
            "model": MODEL, "stockCount": len(candidates), "groups": groups,
        })
        print(f"완료: {len(groups)}개 테마, {len(candidates)}종목")
    except Exception as e:
        send_telegram(f"❌ 테마 분석 실패, 수동 확인 요망\n{run_dt.strftime('%m/%d %H:%M')} KST\n원인: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
