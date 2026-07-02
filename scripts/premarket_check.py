"""07:00 KST premarket theme-overlap check.

Fetches the prior US session's theme-proxy price moves, cross-checks them
against today's KR buy-plan themes, and alerts via Telegram before the
08:00 KST NXT open.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
import yfinance as yf

KST = ZoneInfo("Asia/Seoul")

THEME_PROXY = {
    "반도체장비": ["AMAT", "LRCX", "KLAC"],
    "메모리반도체": ["MU", "SNDK", "WDC"],
    "AI반도체": ["NVDA", "AVGO", "AMD"],
    "반도체소재부품": ["SOXX"],
    "2차전지": ["LIT", "ALB", "TSLA"],
    "바이오": ["XBI"],
    "소프트웨어/AI서비스": ["IGV", "MSFT", "META"],
    "사이버보안": ["HACK"],
    "금융": ["XLF"],
    "에너지/정유": ["XLE", "USO"],
    "원전": ["URA", "NLR"],
    "로봇": ["BOTZ"],
    "우주항공": ["ITA", "ARKX"],
    "게임": ["ESPO"],
    "방산": None,
    "조선": None,
    "엔터": None,
    "화장품": None,
    "정치테마": None,
    "기타(미장무관)": None,
}

# SOX가 급락하면 이 테마들은 자체 점수와 무관하게 SOX 점수까지 함께 반영한다.
SEMI_THEMES = {"반도체장비", "메모리반도체", "AI반도체", "반도체소재부품"}

INDEX_TICKERS = {"나스닥": "^IXIC", "S&P500": "^GSPC", "필라델피아반도체": "^SOX"}

THEME_DOWN_MODERATE = -3.0
THEME_DOWN_SEVERE = -5.0

# 매년 초 KRX 휴장일 공지로 갱신할 것 (best-effort 수동 리스트, 2026-07-02 기준 작성).
# 주말은 요일 체크로 걸러지므로 평일 휴장일만 넣는다.
KR_MARKET_HOLIDAYS_2026 = {
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-02",
    "2026-05-01", "2026-05-05", "2026-05-25", "2026-08-17",
    "2026-09-24", "2026-09-25", "2026-10-05", "2026-10-09",
    "2026-12-25", "2026-12-31",
}


def kst_now():
    return datetime.now(KST)


def is_kr_market_holiday(dt):
    if dt.weekday() >= 5:
        return True
    return dt.strftime("%Y-%m-%d") in KR_MARKET_HOLIDAYS_2026


def expected_last_us_trading_date(run_dt_kst):
    """전날(KST) 기준 가장 최근 평일 — 정상장이면 US 데이터의 최신 종가일과 같아야 한다."""
    d = (run_dt_kst - timedelta(days=1)).date()
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def fetch_prices(tickers, end_date=None, retries=3, delay=5):
    """전 종목의 최근 거래일 등락률(%)과 최신 종가일을 반환. 3회 재시도 후 실패 시 raise."""
    kwargs = dict(period="15d") if end_date is None else dict(
        start=(end_date - timedelta(days=20)).isoformat(),
        end=(end_date + timedelta(days=1)).isoformat(),
    )
    last_err = None
    for attempt in range(retries):
        try:
            data = yf.download(tickers, interval="1d", group_by="ticker",
                                threads=True, progress=False, **kwargs)
            pct = {}
            last_dates = {}
            for t in tickers:
                close = data[t]["Close"].dropna()
                if len(close) < 2:
                    raise ValueError(f"{t}: insufficient data ({len(close)} rows)")
                pct[t] = float((close.iloc[-1] / close.iloc[-2] - 1) * 100)
                last_dates[t] = close.index[-1].date()
            return pct, last_dates
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(delay)
    raise RuntimeError(f"yfinance fetch failed after {retries} attempts: {last_err}")


def compute_theme_scores(pct):
    scores = {}
    for theme, proxies in THEME_PROXY.items():
        if not proxies:
            continue
        scores[theme] = sum(pct[t] for t in proxies) / len(proxies)
    return scores


_VERDICT_RANK = {"ok": 0, "reduce": 1, "cancel": 2}


def judge_stock(themes, theme_scores, pct, sox_pct):
    """종목의 테마 목록 중 가장 나쁜 판정을 반환. themes가 비었거나 모두 미장무관이면 ok."""
    if not themes:
        return "ok", "테마 미지정"

    best_verdict = "ok"
    reasons = []
    any_mapped = False
    for theme in themes:
        proxies = THEME_PROXY.get(theme)
        if not proxies:
            continue
        any_mapped = True
        score = theme_scores[theme]
        is_semi = theme in SEMI_THEMES
        effective = min(score, sox_pct) if is_semi else score

        if effective <= THEME_DOWN_SEVERE:
            v = "cancel"
        elif effective <= THEME_DOWN_MODERATE:
            v = "reduce"
        else:
            v = "ok"

        if _VERDICT_RANK[v] > _VERDICT_RANK[best_verdict]:
            best_verdict = v

        if v != "ok":
            detail = ", ".join(f"{t} {pct[t]:+.1f}%" for t in proxies)
            note = f"{theme}({detail})"
            if is_semi and sox_pct <= THEME_DOWN_MODERATE:
                note += f", SOX {sox_pct:+.1f}%"
            reasons.append(note)

    if best_verdict == "ok":
        return "ok", ("미장 무관" if not any_mapped else "정상 범위")
    return best_verdict, " / ".join(reasons)
