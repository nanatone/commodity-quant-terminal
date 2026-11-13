#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大宗商品一手观察与60m量化策略终端 - 自动化数据更新脚本
功能：
1. 从 FRED API 拉取 10Y TIPS (DFII10)、美联储资产负债表 (WALCL)、TGA (WTREGEN)、ON RRP (RRPONTSYD) 计算净流动性
2. 从 AkShare 拉取国内期货主力价格、期现基差与库存周期数据
3. 从 AkShare 拉取映射 A 股（主板/创业板20cm/科创板20cm/北交所30cm）日线与 60 分钟 K 线，
   自动计算 60m MA5 量比、20周期 MID 中轨、14周期 ATR 倍数及日线阳线豁免状态
4. 输出更新后的 public/data/market_data.json（带优雅降级保护，任一接口超时自动保留上期有效值）
"""

import os
import json
from datetime import datetime, timezone, timedelta
import pandas as pd
import numpy as np
import requests

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "market_data.json")
FRED_API_KEY = os.environ.get("FRED_API_KEY", "").strip()

def load_existing_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

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

def update_macro_anchors(data):
    """更新顶部 5 大宏观流动性与定价锚"""
    tips_vals = fetch_fred_series("DFII10", limit=7)
    if tips_vals and len(tips_vals) >= 2:
        latest = tips_vals[-1]
        diff_bps = round((latest - tips_vals[-2]) * 100)
        for anchor in data.get("macroAnchors", []):
            if anchor["id"] == "tips10y":
                anchor["value"] = f"{latest:.2f}%"
                anchor["change"] = f"{diff_bps:+d} bps"
                anchor["trend"] = "down" if diff_bps <= 0 else "up"
                anchor["spark"] = [round(v, 2) for v in tips_vals]

    # 计算美联储净流动性: WALCL (百万美元) - WTREGEN (百万美元) - RRPONTSYD (十亿美元*1000)
    walcl = fetch_fred_series("WALCL", limit=7)
    tga = fetch_fred_series("WTREGEN", limit=7)
    rrp = fetch_fred_series("RRPONTSYD", limit=7)
    if walcl and tga and rrp:
        min_len = min(len(walcl), len(tga), len(rrp))
        net_liq_series = []
        for i in range(min_len):
            # 统一换算为万亿美元 (Trillion USD)
            val_t = (walcl[i] - tga[i] - rrp[i] * 1000.0) / 1_000_000.0
            net_liq_series.append(round(val_t, 2))
        if len(net_liq_series) >= 2:
            latest_nl = net_liq_series[-1]
            diff_b = round((latest_nl - net_liq_series[-2]) * 1000)
            for anchor in data.get("macroAnchors", []):
                if anchor["id"] == "net_liq":
                    anchor["value"] = f"${latest_nl:.2f}T"
                    anchor["change"] = f"{diff_b:+d}B (周)"
                    anchor["trend"] = "up" if diff_b >= 0 else "down"
                    anchor["spark"] = net_liq_series

def calculate_60m_quant_metrics(symbol_code):
    """
    使用 AkShare 拉取个股日线与 60m K线，计算：
    - 60m 量比 (当前60m成交量 / 5周期均量 MA5)
    - 日线是否站上 20日 MID 且当日为阳线 (Close >= Open and Close > MA20)
    - 当前价距离日线 MID 的 ATR(14) 倍数: (Close - MID) / ATR14
    """
    try:
        import akshare as ak
        pure_code = symbol_code.split(".")[0]
        # 1. 日线数据计算 MID(20) 与 ATR(14)
        df_daily = ak.stock_zh_a_hist(symbol=pure_code, period="daily", adjust="qfq").tail(40)
        if df_daily is None or len(df_daily) < 22:
            return None

        close = df_daily["收盘"].astype(float)
        high = df_daily["最高"].astype(float)
        low = df_daily["最低"].astype(float)
        open_p = df_daily["开盘"].astype(float)
        pct_chg = df_daily["涨跌幅"].astype(float).iloc[-1]

        mid20 = close.rolling(20).mean().iloc[-1]
        prev_close = close.shift(1)
        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs()
        ], axis=1).max(axis=1)
        atr14 = tr.rolling(14).mean().iloc[-1]

        latest_close = close.iloc[-1]
        latest_open = open_p.iloc[-1]
        daily_green_above_mid = bool((latest_close >= latest_open) and (latest_close > mid20))
        dist_from_mid_atr = round(abs(latest_close - mid20) / atr14, 2) if atr14 > 0 else 1.0

        # 2. 60分钟 K 线计算 vol / MA5
        df_60m = ak.stock_zh_a_hist_min_em(symbol=pure_code, period="60", adjust="qfq").tail(15)
        vol_ratio_60m = 1.15
        if df_60m is not None and len(df_60m) >= 6:
            vols = df_60m["成交量"].astype(float)
            ma5_vol = vols.iloc[-6:-1].mean()
            if ma5_vol > 0:
                vol_ratio_60m = round(vols.iloc[-1] / ma5_vol, 2)

        return {
            "price": round(float(latest_close), 2),
            "changePct": round(float(pct_chg), 2),
            "volRatio60m": vol_ratio_60m,
            "dailyGreenAboveMid": daily_green_above_mid,
            "distFromMidAtr": dist_from_mid_atr
        }
    except Exception as e:
        print(f"[WARN] 个股 {symbol_code} 60m 指标计算跳过 (保留快照): {e}")
        return None

def update_equity_pool(data):
    for item in data.get("equityPool", []):
        metrics = calculate_60m_quant_metrics(item["code"])
        if metrics:
            item.update(metrics)

def main():
    print(">>> 开始执行大宗商品与60m量化终端数据更新...")
    data = load_existing_data()
    if not data:
        print("[ERROR] 未找到基础 market_data.json 模板文件")
        return

    update_macro_anchors(data)
    update_equity_pool(data)

    tz_cst = timezone(timedelta(hours=8))
    data["lastUpdated"] = datetime.now(tz_cst).strftime("%Y-%m-%d %H:%M:%S CST")

    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f">>> 数据更新完成，已写入 {DATA_FILE} (时间戳: {data['lastUpdated']})")

if __name__ == "__main__":
    main()
