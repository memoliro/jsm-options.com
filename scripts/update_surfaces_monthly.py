#!/usr/bin/env python3
"""Daily CBOE delayed-chain snapshot -> data/surfaces/{TICKER}.json

Free CBOE delayed quotes are a current chain, not a history archive.
Each weekday run appends one trading day. First stored date is the first actual session. Drop CBOE DataShop CSVs in cboe_inbox/
and this script will also merge those via cboe_to_surface.py when present.

Usage:
  python scripts/update_surfaces_monthly.py
  python scripts/update_surfaces_monthly.py --tickers SPY QQQ AAPL
"""
import argparse, json, math, os, re, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "surfaces"
SNAP = ROOT / "data" / "snapshots"
TENORS = [7, 14, 30, 60, 90, 180, 365]
TICKERS = ["SPY","QQQ","IWM","DIA","SPX","XLF","XLK","XLE","SMH","TLT","GLD","SLV","USO","AAPL","MSFT","NVDA","TSLA","META","AMZN","GOOGL"]
Q = {"SPY":0.013,"QQQ":0.006,"IWM":0.012,"DIA":0.015,"SPX":0.013,"XLF":0.016,"XLK":0.006,"XLE":0.030,"SMH":0.006,"TLT":0.038,"GLD":0.0,"SLV":0.0,"USO":0.0,"AAPL":0.004,"MSFT":0.007,"NVDA":0.0003,"TSLA":0.0,"META":0.003,"AMZN":0.0,"GOOGL":0.003}

def cboe_symbol(t):
    return {"SPX":"_SPX","NDX":"_NDX","RUT":"_RUT","VIX":"_VIX"}.get(t, t)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent":"jsm-options-monthly/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def unix_day(dt):
    return int(dt.replace(tzinfo=timezone.utc).timestamp() // 86400)

def parse_option(sym):
    m = re.match(r"([A-Z0-9^]+)(\d{6})([CP])(\d+)$", sym)
    if not m:
        return None
    exp = datetime.strptime(m.group(2), "%y%m%d")
    k = int(m.group(4)) / 1000.0
    return exp, m.group(3), k

def fit(payload):
    data = payload.get("data") or {}
    S = float(data.get("current_price") or 0)
    iv30 = data.get("iv30")
    iv30 = float(iv30)/100.0 if iv30 and float(iv30) > 1.5 else (float(iv30) if iv30 else None)
    today = datetime.now(timezone.utc).date()
    buckets = {t: [] for t in TENORS}
    puts = {t: [] for t in TENORS}
    calls = {t: [] for t in TENORS}
    for o in data.get("options") or []:
        iv = o.get("iv")
        if iv is None:
            continue
        iv = float(iv)
        if not (0.03 < iv < 2.5):
            continue
        parsed = parse_option(str(o.get("option") or ""))
        if not parsed or S <= 0:
            continue
        exp, cp, k = parsed
        dte = (exp.date() - today).days
        if dte < 4 or dte > 420:
            continue
        tenor = min(TENORS, key=lambda t: abs(t - dte))
        if abs(k - S) / S <= 0.03:
            buckets[tenor].append(iv)
        m = math.log(k / S)
        if cp == "P" and -0.15 < m < -0.03:
            puts[tenor].append((m, iv))
        if cp == "C" and 0.03 < m < 0.15:
            calls[tenor].append((m, iv))
    atm, sp, sc = [], [], []
    for t in TENORS:
        a = sorted(buckets[t])
        atm_v = a[len(a)//2] if a else (iv30 or 0.2)
        atm.append(round(atm_v, 4))
        def slope(pairs, fallback):
            if len(pairs) < 4:
                return fallback
            # iv = atm * (1 - slope * ln(K/S)) => slope = (1 - iv/atm) / m
            vals = [(1 - iv / atm_v) / m for m, iv in pairs if m]
            vals = [v for v in vals if -5 < v < 8]
            if not vals:
                return fallback
            vals.sort()
            return round(vals[len(vals)//2], 4)
        sp.append(slope(puts[t], 1.6))
        sc.append(slope(calls[t], 0.8))
    return S, atm, sp, sc, iv30

def load_surface(path, ticker):
    if path.exists():
        d = json.loads(path.read_text())
        src = (d.get("meta") or {}).get("source", "")
        if "synthetic" in src:
            return blank(ticker)
        return d
    return blank(ticker)

def blank(ticker):
    return {"v":2,"ticker":ticker,"q":Q.get(ticker,0),"updated":"","tenors":TENORS,"dates":[],"spot":[],"atm":[],"sp":[],"sc":[],"meta":{"source":"CBOE delayed quotes, appended monthly","model":"iv(K)=atm*(1-slope*ln(K/S))"}}

def append(surf, day, S, atm, sp, sc):
    dates = surf["dates"]
    if dates and dates[-1] == day:
        i = len(dates) - 1
        surf["spot"][i] = round(S, 4)
        n = len(TENORS)
        surf["atm"][i*n:(i+1)*n] = atm
        surf["sp"][i*n:(i+1)*n] = sp
        surf["sc"][i*n:(i+1)*n] = sc
    else:
        surf["dates"].append(day)
        surf["spot"].append(round(S, 4))
        surf["atm"].extend(atm)
        surf["sp"].extend(sp)
        surf["sc"].extend(sc)
    # keep 3 years of trading days
    if len(surf["dates"]) > 780:
        drop = len(surf["dates"]) - 780
        n = len(TENORS)
        surf["dates"] = surf["dates"][drop:]
        surf["spot"] = surf["spot"][drop:]
        surf["atm"] = surf["atm"][drop*n:]
        surf["sp"] = surf["sp"][drop*n:]
        surf["sc"] = surf["sc"][drop*n:]
    surf["updated"] = datetime.now(timezone.utc).date().isoformat()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", nargs="*", default=TICKERS)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    snap_dir = SNAP / month
    snap_dir.mkdir(parents=True, exist_ok=True)
    day = unix_day(datetime.now(timezone.utc))
    manifest = []
    for t in args.tickers:
        url = f"https://cdn.cboe.com/api/global/delayed_quotes/options/{cboe_symbol(t)}.json"
        print("fetch", t, flush=True)
        try:
            payload = fetch(url)
        except Exception as e:
            print("  fail", t, e)
            continue
        S, atm, sp, sc, iv30 = fit(payload)
        if S <= 0:
            print("  no spot", t)
            continue
        path = OUT / f"{t}.json"
        surf = load_surface(path, t)
        append(surf, day, S, atm, sp, sc)
        path.write_text(json.dumps(surf, separators=(",", ":")))
        (snap_dir / f"{t}.json").write_text(json.dumps({
            "ticker": t, "day": day, "spot": S, "iv30": iv30, "atm": atm, "sp": sp, "sc": sc,
            "asof": payload.get("timestamp")
        }, separators=(",", ":")))
        manifest.append({"ticker": t, "days": len(surf["dates"]), "updated": surf["updated"], "first": surf["dates"][0], "last": surf["dates"][-1], "q": surf["q"], "source": "cboe-delayed"})
        print(f"  {t} spot={S:.2f} atm30={atm[TENORS.index(30)]:.3f} days={len(surf['dates'])}")
        time.sleep(0.4)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("wrote", OUT / "manifest.json")

if __name__ == "__main__":
    main()
