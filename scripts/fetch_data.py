#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大宗商品一手观察与60m量化策略终端 - 自动化数据更新脚本
数据源：
1. FRED API: 10Y TIPS 实际利率 (DFII10)、美联储净流动性 (WALCL - WTREGEN - RRPONTSYD)
2. 新浪财经全球/外汇接口: 美元指数 (DXY)、COMEX黄金/WTI原油/COMEX铜比价锚、A股(含北交所)60m量比
3. Tushare Pro API: 国内商品期货主力/期限结构/仓单 (fut_daily, sge_daily, fut_wsr)、
   A股日线前复权与ATR/MID指标 (daily, adj_factor)、申万行业板块共振 (sw_daily)
4. 全部更新具备独立容错与优雅降级保护，任一外部接口异常时保留上期有效快照。
"""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "market_data.json")
FRED_API_KEY = os.environ.get("FRED_API_KEY", "").strip()
TUSHARE_TOKEN = os.environ.get("TUSHARE_TOKEN", "").strip()
TUSHARE_URL = "https://api.tushare.pro"

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://finance.sina.com.cn/",
}


def load_existing_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def ts_call(api_name, fields="", **params):
    """调用 Tushare Pro HTTP 接口，带瞬时 502 重试保护，返回 DataFrame。"""
    if not TUSHARE_TOKEN:
        return None
    payload = {
        "api_name": api_name,
        "token": TUSHARE_TOKEN,
        "params": params,
        "fields": fields,
    }
    last_err = None
    for attempt in range(3):
        try:
            resp = requests.post(TUSHARE_URL, json=payload, timeout=15)
            resp.raise_for_status()
            body = resp.json()
            if body.get("code") != 0:
                print(f"[WARN] Tushare {api_name} ({params}) 返回错误 {body.get('code')}: {body.get('msg')}")
                return None
            data = body.get("data") or {}
            items = data.get("items") or []
            cols = data.get("fields") or []
            if not items or not cols:
                return pd.DataFrame(columns=cols)
            return pd.DataFrame(items, columns=cols)
        except Exception as e:
            last_err = e
            if attempt < 2:
                time.sleep(0.8 * (attempt + 1))
    print(f"[WARN] Tushare {api_name} 请求失败: {last_err}")
    return None


def fetch_fred_series(series_id, limit=7):
    """拉取圣路易斯联储 FRED 最近 N 期序列数据"""
    if not FRED_API_KEY:
        return None
    url = (
        f"https://api.stlouisfed.org/fred/series/observations"
        f"?series_id={series_id}&api_key={FRED_API_KEY}&file_type=json&sort_order=desc&limit={limit}"
    )
    try:
        resp = requests.get(url, timeout=12)
        resp.raise_for_status()
        obs = resp.json().get("observations", [])
        vals = [float(x["value"]) for x in reversed(obs) if x["value"] != "."]
        return vals if vals else None
    except Exception as e:
        print(f"[WARN] FRED {series_id} 拉取失败: {e}")
        return None


def fetch_sina_dxy():
    """从新浪外汇接口拉取美元指数日K线（返回最近7个交易日收盘价列表）"""
    url = "https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/var%20t=/NewForexService.getDayKLine?symbol=fx_sdiniw"
    try:
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=12)
        resp.raise_for_status()
        m = re.search(r'"([^"]+)"', resp.text)
        if not m:
            return None
        closes = []
        for row in m.group(1).split("|"):
            parts = row.split(",")
            if len(parts) >= 5:
                closes.append(float(parts[4]))
        return closes[-7:] if len(closes) >= 2 else None
    except Exception as e:
        print(f"[WARN] 新浪 DXY 拉取失败: {e}")
        return None


def fetch_sina_global_futures(symbol):
    """从新浪外盘期货接口拉取 {date: close} 字典 (GC/CL/HG)"""
    url = f"https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol={symbol}"
    try:
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=12)
        resp.raise_for_status()
        txt = resp.text
        left = txt.find("[")
        right = txt.rfind("]")
        if left == -1 or right == -1:
            return None
        rows = json.loads(txt[left : right + 1])
        series = {}
        for r in rows[-30:]:
            dt = r.get("date")
            c = r.get("close")
            if dt and c is not None:
                val = float(c)
                if val > 0:
                    series[dt] = val
        return series if series else None
    except Exception as e:
        print(f"[WARN] 新浪外盘期货 {symbol} 拉取失败: {e}")
        return None


def set_anchor(data, anchor_id, **updates):
    for anchor in data.get("macroAnchors", []):
        if anchor.get("id") == anchor_id:
            anchor.update(updates)
            return


def update_macro_anchors(data):
    """更新顶部 5 大宏观流动性与跨资产比价锚"""
    # 1. 10Y TIPS (FRED)
    tips_vals = fetch_fred_series("DFII10", limit=7)
    if tips_vals and len(tips_vals) >= 2:
        latest = tips_vals[-1]
        diff_bps = round((latest - tips_vals[-2]) * 100)
        set_anchor(
            data,
            "tips10y",
            value=f"{latest:.2f}%",
            change=f"{diff_bps:+d} bps",
            trend="down" if diff_bps <= 0 else "up",
            signal="实际利率回落·利多金铜" if diff_bps <= 0 else "实际利率上行·留意估值压制",
            spark=[round(v, 2) for v in tips_vals],
        )

    # 2. 美联储净流动性 (FRED: WALCL - TGA - ON RRP)
    walcl = fetch_fred_series("WALCL", limit=7)
    tga = fetch_fred_series("WTREGEN", limit=7)
    rrp = fetch_fred_series("RRPONTSYD", limit=7)
    if walcl and tga and rrp:
        min_len = min(len(walcl), len(tga), len(rrp))
        net_liq_series = [
            round((walcl[i] - tga[i] - rrp[i] * 1000.0) / 1_000_000.0, 2)
            for i in range(min_len)
        ]
        if len(net_liq_series) >= 2:
            latest_nl = net_liq_series[-1]
            diff_b = round((latest_nl - net_liq_series[-2]) * 1000)
            set_anchor(
                data,
                "net_liq",
                value=f"${latest_nl:.2f}T",
                change=f"{diff_b:+d}B (周)",
                trend="up" if diff_b >= 0 else "down",
                signal="准备金充裕" if diff_b >= 0 else "流动性边际收敛",
                spark=net_liq_series,
            )

    # 3. 美元指数 DXY (Sina Forex)
    dxy_vals = fetch_sina_dxy()
    if dxy_vals and len(dxy_vals) >= 2:
        latest_dxy = dxy_vals[-1]
        prev_dxy = dxy_vals[-2]
        pct = (latest_dxy - prev_dxy) / prev_dxy * 100.0 if prev_dxy else 0.0
        set_anchor(
            data,
            "dxy",
            value=f"{latest_dxy:.2f}",
            change=f"{pct:+.2f}%",
            trend="down" if pct <= 0 else "up",
            signal="弱美元周期" if latest_dxy < 103.5 else "美元偏强震荡",
            spark=[round(v, 2) for v in dxy_vals],
        )

    # 4 & 5. 金油比 (GC/CL) 与 铜金比 (HG/GC)
    gc_map = fetch_sina_global_futures("GC")
    cl_map = fetch_sina_global_futures("CL")
    hg_map = fetch_sina_global_futures("HG")

    if gc_map and cl_map:
        common_go = sorted(set(gc_map) & set(cl_map))[-7:]
        if len(common_go) >= 2:
            go_series = [round(gc_map[d] / cl_map[d], 1) for d in common_go]
            diff_go = round(go_series[-1] - go_series[-2], 1)
            set_anchor(
                data,
                "gold_oil",
                value=f"{go_series[-1]:.1f}x",
                change=f"{diff_go:+.1f}x",
                trend="down" if diff_go <= 0 else "up",
                signal="工业通胀修复" if diff_go <= 0 else "避险溢价走扩",
                spark=go_series,
            )

    if hg_map and gc_map:
        common_cg = sorted(set(hg_map) & set(gc_map))[-7:]
        if len(common_cg) >= 2:
            # COMEX 铜 (美分/磅) * 22.0462 换算为美元/吨再与金价 (美元/盎司) 比值
            cg_series = [round((hg_map[d] * 22.0462) / gc_map[d], 2) for d in common_cg]
            diff_cg = round(cg_series[-1] - cg_series[-2], 2)
            set_anchor(
                data,
                "cop_gold",
                value=f"{cg_series[-1]:.2f}",
                change=f"{diff_cg:+.2f}",
                trend="up" if diff_cg >= 0 else "down",
                signal="全球制造业回暖" if diff_cg >= 0 else "避险强于顺周期",
                spark=cg_series,
            )


def get_recent_fut_dates():
    """通过 CU.SHF 主力连续获取近期期货交易日列表（降序）"""
    df = ts_call("fut_daily", ts_code="CU.SHF", fields="trade_date")
    if df is None or df.empty:
        return []
    dates = sorted(df["trade_date"].astype(str).unique().tolist(), reverse=True)
    return dates[:15]


def fetch_wsr_weekly_change(prefix, latest_dt, prev_week_dt):
    """通过 Tushare fut_wsr 计算近一周注册仓单变化率"""
    df = ts_call("fut_wsr", symbol=prefix, start_date=prev_week_dt, end_date=latest_dt, fields="trade_date,vol")
    if df is None or df.empty:
        return None
    df["vol_num"] = pd.to_numeric(df["vol"], errors="coerce").fillna(0.0)
    grouped = df.groupby("trade_date")["vol_num"].sum().sort_index()
    grouped = grouped[grouped > 0]
    if len(grouped) < 2:
        return None
    vol_prev = float(grouped.iloc[0])
    vol_now = float(grouped.iloc[-1])
    if vol_prev <= 0:
        return None
    return f"{(vol_now - vol_prev) / vol_prev * 100.0:+.1f}%"


def classify_structure(basis, basis_pct):
    if basis_pct >= 1.5:
        return "Deep Back (极度升水)"
    if basis_pct >= 0.4:
        return "Strong Back (强升水)"
    if basis >= 0:
        return "Back (现货升水)"
    return "Contango (期货升水)"


def format_price(val, decimals):
    if decimals == 0:
        return int(round(val))
    return round(float(val), decimals)


def update_commodities(data, trade_dates):
    """通过 Tushare fut_daily + sge_daily + fut_wsr 更新 Tab 1 大宗商品期现数据"""
    if not TUSHARE_TOKEN or not trade_dates:
        return

    latest_dt = trade_dates[0]
    prev_week_dt = trade_dates[min(5, len(trade_dates) - 1)]

    df_shfe = ts_call("fut_daily", trade_date=latest_dt, exchange="SHFE")
    df_ine = ts_call("fut_daily", trade_date=latest_dt, exchange="INE")
    df_sge = ts_call("sge_daily", ts_code="Au99.99", fields="ts_code,trade_date,close")

    sge_spot_gold = None
    if df_sge is not None and not df_sge.empty:
        df_sge = df_sge.sort_values("trade_date")
        val = pd.to_numeric(df_sge["close"].iloc[-1], errors="coerce")
        if pd.notna(val) and val > 0:
            sge_spot_gold = float(val)

    exchange_frames = {
        "SHF": df_shfe,
        "INE": df_ine,
    }
    commodity_map = {
        "gold": ("AU", "SHF", 2),
        "copper": ("CU", "SHF", 0),
        "alumina": ("AO", "SHF", 0),
        "crude": ("SC", "INE", 1),
        "rebar": ("RB", "SHF", 0),
    }

    for item in data.get("commodities", []):
        cid = item.get("id")
        if cid not in commodity_map:
            continue
        prefix, exch_suffix, decimals = commodity_map[cid]
        df_exch = exchange_frames.get(exch_suffix)
        if df_exch is None or df_exch.empty:
            continue

        pattern = rf"^{prefix}\d{{4}}\.{exch_suffix}$"
        sub = df_exch[df_exch["ts_code"].astype(str).str.match(pattern)].copy()
        if sub.empty:
            continue

        for col in ("close", "pre_settle", "oi"):
            sub[col] = pd.to_numeric(sub[col], errors="coerce").fillna(0.0)
        sub = sub[(sub["close"] > 0) & (sub["oi"] > 0)].sort_values("ts_code")
        if sub.empty:
            continue

        main_row = sub.loc[sub["oi"].idxmax()]
        main_code = str(main_row["ts_code"]).split(".")[0]
        futures_price = float(main_row["close"])
        pre_settle = float(main_row["pre_settle"])
        change_pct = round((futures_price - pre_settle) / pre_settle * 100.0, 2) if pre_settle > 0 else 0.0

        near_row = sub.iloc[0]
        near_code = str(near_row["ts_code"]).split(".")[0]
        if cid == "gold" and sge_spot_gold is not None:
            spot_price = sge_spot_gold
            code_label = f"{main_code} / Au99.99"
        else:
            spot_price = float(near_row["close"])
            code_label = f"{main_code} / 近月{near_code}" if near_code != main_code else f"{main_code} (SHFE/INE)"

        basis = round(spot_price - futures_price, 2)
        basis_pct = round((basis / futures_price) * 100.0, 2) if futures_price > 0 else 0.0

        curve_vals = [format_price(spot_price, decimals)] + [
            format_price(v, decimals) for v in sub["close"].head(5).tolist()
        ]
        while len(curve_vals) < 6 and curve_vals:
            curve_vals.append(curve_vals[-1])

        item["code"] = code_label
        item["futuresPrice"] = format_price(futures_price, decimals)
        item["spotPrice"] = format_price(spot_price, decimals)
        item["changePct"] = change_pct
        item["basis"] = format_price(basis, decimals if decimals > 0 else 0)
        item["basisPct"] = basis_pct
        item["structure"] = classify_structure(basis, basis_pct)
        item["forwardCurve"] = curve_vals[:6]

        history = item.get("basisHistory") or []
        if history:
            history[-1]["basis"] = item["basis"]

        wsr_chg = fetch_wsr_weekly_change(prefix, latest_dt, prev_week_dt)
        if wsr_chg:
            item["invWeeklyChange"] = wsr_chg


def fetch_shenwan_sector_map(trade_dates):
    """拉取最新交易日申万行业涨跌幅字典"""
    for dt in trade_dates[:3]:
        df = ts_call("sw_daily", trade_date=dt, fields="ts_code,name,pct_change")
        if df is not None and not df.empty:
            sector_map = {}
            for _, row in df.iterrows():
                name = str(row["name"]).strip()
                pct = pd.to_numeric(row["pct_change"], errors="coerce")
                if pd.notna(pct):
                    sector_map[name] = round(float(pct), 2)
            if sector_map:
                return sector_map
    return {}


def match_sector_pct(commodity_desc, sector_map):
    if not sector_map:
        return None, None
    rules = [
        ("铜", "铜"),
        ("氧化铝", "铝"),
        ("铝", "铝"),
        ("油田", "油服工程"),
        ("原油", "石油石化"),
        ("钨", "小金属"),
        ("战略金属", "小金属"),
        ("黄金", "黄金"),
    ]
    for kw, sw_name in rules:
        if kw in commodity_desc and sw_name in sector_map:
            return sw_name, sector_map[sw_name]
    if "有色金属" in sector_map:
        return "有色金属", sector_map["有色金属"]
    return None, None


def to_sina_symbol(ts_code):
    code, exch = ts_code.split(".")
    return f"{exch.lower()}{code}"


def fetch_sina_60m_vol_ratio(ts_code):
    """通过新浪 60m K线接口计算最新 60m 成交量 / 前5根均量 (MA5)"""
    sina_sym = to_sina_symbol(ts_code)
    url = f"https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol={sina_sym}&scale=60&ma=no&datalen=15"
    try:
        resp = requests.get(url, headers=HTTP_HEADERS, timeout=10)
        resp.raise_for_status()
        bars = resp.json()
        if not isinstance(bars, list) or len(bars) < 6:
            return None
        vols = [float(b["volume"]) for b in bars if b.get("volume") is not None]
        if len(vols) < 6:
            return None
        ma5 = float(np.mean(vols[-6:-1]))
        if ma5 <= 0:
            return None
        return round(vols[-1] / ma5, 2)
    except Exception as e:
        print(f"[WARN] 新浪 60m {ts_code} 获取失败 (将用日线量比兜底): {e}")
        return None


def calculate_stock_metrics(item, start_date, sector_map):
    ts_code = item["code"]
    df_daily = ts_call(
        "daily",
        ts_code=ts_code,
        start_date=start_date,
        fields="ts_code,trade_date,open,high,low,close,vol,pct_chg",
    )
    if df_daily is None or len(df_daily) < 22:
        return None

    df_adj = ts_call(
        "adj_factor",
        ts_code=ts_code,
        start_date=start_date,
        fields="ts_code,trade_date,adj_factor",
    )

    df = df_daily.sort_values("trade_date").reset_index(drop=True)
    if df_adj is not None and not df_adj.empty:
        df = pd.merge(df, df_adj[["trade_date", "adj_factor"]], on="trade_date", how="left")
        df["adj_factor"] = pd.to_numeric(df["adj_factor"], errors="coerce").ffill().bfill().fillna(1.0)
    else:
        df["adj_factor"] = 1.0

    for col in ("open", "high", "low", "close", "vol", "pct_chg"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    latest_adj = float(df["adj_factor"].iloc[-1]) or 1.0
    factor = df["adj_factor"] / latest_adj
    q_open = df["open"] * factor
    q_high = df["high"] * factor
    q_low = df["low"] * factor
    q_close = df["close"] * factor

    mid20 = float(q_close.rolling(20).mean().iloc[-1])
    exp2 = float(q_close.ewm(span=10, adjust=False).mean().iloc[-1])
    prev_close = q_close.shift(1)
    tr = pd.concat(
        [
            q_high - q_low,
            (q_high - prev_close).abs(),
            (q_low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    atr14 = float(tr.rolling(14).mean().iloc[-1])

    latest_raw_close = float(df["close"].iloc[-1])
    latest_q_close = float(q_close.iloc[-1])
    latest_q_open = float(q_open.iloc[-1])
    pct_chg = float(df["pct_chg"].iloc[-1])

    daily_green_above_mid = bool((latest_q_close >= latest_q_open) and (latest_q_close > mid20))
    dist_from_mid_atr = round(abs(latest_q_close - mid20) / atr14, 2) if atr14 > 0 else 1.0

    vol_ratio_60m = fetch_sina_60m_vol_ratio(ts_code)
    vol_source = "60m量比"
    if vol_ratio_60m is None:
        vols = df["vol"].dropna()
        ma5_daily = float(vols.iloc[-6:-1].mean()) if len(vols) >= 6 else 0.0
        vol_ratio_60m = round(float(vols.iloc[-1]) / ma5_daily, 2) if ma5_daily > 0 else 1.0
        vol_source = "日线5日量比(兜底)"

    # 趋势结构判断
    if latest_q_close > mid20 and mid20 >= exp2:
        exp2_trend = "多头排列 (MID >= EXP2)" if dist_from_mid_atr <= 1.5 else "强趋势加速 (高于MID)"
    elif latest_q_close > mid20:
        exp2_trend = "站上MID转强"
    elif latest_q_close >= exp2:
        exp2_trend = "回踩EXP2蓄势"
    else:
        exp2_trend = "跌破MID弱势整理"

    # 结合申万行业涨跌幅计算共振评分
    sw_name, sw_pct = match_sector_pct(item.get("commodity", ""), sector_map)
    score = 65
    if daily_green_above_mid:
        score += 12
    if vol_ratio_60m >= 1.4:
        score += 12
    elif vol_ratio_60m >= 1.05:
        score += 7
    if dist_from_mid_atr <= 1.0 and latest_q_close > mid20:
        score += 6
    if sw_pct is not None:
        score += 5 if sw_pct > 0 else (-3 if sw_pct < -1.5 else 0)
    score = max(40, min(99, int(round(score))))

    # 生成动态策略动作与说明
    if dist_from_mid_atr > (3.0 if daily_green_above_mid else 2.0):
        action = "Halve (超ATR上限减半)"
    elif not daily_green_above_mid and dist_from_mid_atr > 1.8:
        action = "Halve (破阳线豁免减半)"
    elif vol_ratio_60m >= 1.40:
        if dist_from_mid_atr > 2.0 and daily_green_above_mid:
            action = "Hold/Exempt (触发stop5.5豁免)"
        else:
            action = "Full (1/1 极佳买点)" if (daily_green_above_mid and dist_from_mid_atr <= 1.0) else "Full (1/1 全仓确认)"
    elif vol_ratio_60m >= 1.05:
        action = "Half (1/2 试仓信号)"
    else:
        action = "Wait (缩量观察)"

    sector_note = f"申万{sw_name} {sw_pct:+.2f}%" if sw_name is not None else "行业共振跟踪中"
    rule_note = (
        f"{vol_source} {vol_ratio_60m:.2f}x，距MID {dist_from_mid_atr:.2f} ATR，"
        f"{'日线阳线站稳MID' if daily_green_above_mid else '日线收阴或未站稳MID'}；{sector_note}"
    )

    return {
        "price": round(latest_raw_close, 2),
        "changePct": round(pct_chg, 2),
        "volRatio60m": vol_ratio_60m,
        "dailyGreenAboveMid": daily_green_above_mid,
        "distFromMidAtr": dist_from_mid_atr,
        "exp2Trend": exp2_trend,
        "resonanceScore": score,
        "positionAction": action,
        "ruleNote": rule_note,
    }


def update_equity_pool(data, trade_dates):
    if not TUSHARE_TOKEN:
        print("[WARN] 未配置 TUSHARE_TOKEN，跳过 A 股池更新")
        return

    tz_cst = timezone(timedelta(hours=8))
    start_date = (datetime.now(tz_cst) - timedelta(days=120)).strftime("%Y%m%d")
    sector_map = fetch_shenwan_sector_map(trade_dates)

    for item in data.get("equityPool", []):
        try:
            metrics = calculate_stock_metrics(item, start_date, sector_map)
            if metrics:
                item.update(metrics)
        except Exception as e:
            print(f"[WARN] 个股 {item.get('code')} 更新跳过 (保留快照): {e}")


def main():
    print(">>> 开始执行大宗商品与60m量化终端全量数据更新...")
    data = load_existing_data()
    if not data:
        print("[ERROR] 未找到基础 market_data.json 模板文件")
        return

    trade_dates = get_recent_fut_dates() if TUSHARE_TOKEN else []
    update_macro_anchors(data)
    update_commodities(data, trade_dates)
    update_equity_pool(data, trade_dates)

    tz_cst = timezone(timedelta(hours=8))
    data["lastUpdated"] = datetime.now(tz_cst).strftime("%Y-%m-%d %H:%M:%S CST")
    if TUSHARE_TOKEN:
        data["dataSource"] = "Tushare Pro (日线/期货/申万行业) + FRED API + Sina 60m Engine"

    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f">>> 数据更新完成，已写入 {DATA_FILE} (时间戳: {data['lastUpdated']})")


if __name__ == "__main__":
    main()
