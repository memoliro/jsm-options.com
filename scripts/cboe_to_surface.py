#!/usr/bin/env python3
"""
cboe_to_surface.py - CBOE DataShop EOD -> compact volatility surface for Strikebench.

Stores per ticker/day:
  spot, atm[tenors], sp[tenors] (put skew), sc[tenors] (call skew)
  model: iv(K) = atm * (1 - slope * ln(K/S))

Output: surfaces/{TICKER}.json ~60-80KB for 3y, 20 tickers = ~1.5MB
- Merges with existing files (new rows win)
- Trims to --keep (default 3y)
- Max 20 tickers enforced (educational repo limit)

Usage monthly:
  python scripts/cboe_to_surface.py --in "cboe_inbox/*.csv" --out public/data/surfaces --tickers SPY QQQ IWM DIA AAPL MSFT NVDA TSLA META GOOGL --div SPY=0.013 QQQ=0.006
  or
  python scripts/cboe_to_surface.py --in "data/*.csv" --out public/data/surfaces --keep 3y --tickers SPY QQQ IWM

GitHub Action: runs 1st of month, looks for cboe_inbox/*.csv if present, otherwise just trims existing.
"""

import argparse
import glob
import json
import os
import sys
from datetime import datetime, timezone
import numpy as np
import pandas as pd

TENORS = [7, 14, 30, 60, 90, 180, 365]
MAX_TICKERS = 20
DEFAULT_KEEP = "3y"  # 2y or 3y or days integer
MIN_DTE, MAX_DTE = 4, 420

POPULAR_20 = ["SPY","QQQ","IWM","DIA","AAPL","MSFT","NVDA","TSLA","META","GOOGL","AMZN","SPX","NDX","RUT","XLF","XLK","SMH","TLT","GLD","VIX"]

def parse_keep(s: str) -> int:
    s = s.strip().lower()
    if s.endswith("y"):
        try:
            years = float(s[:-1])
            return int(365.25 * years)
        except:
            pass
    return int(s)

def first_col(cols, names):
    for n in names:
        if n in cols:
            return n
    return None

def load_filtered(paths, tickers):
    """Stream CSVs, keep only rows needed for surface fit."""
    frames = {t: [] for t in tickers}
    total_rows = 0
    kept_rows = 0
    for path in paths:
        print(f"reading {path}", flush=True)
        try:
            for chunk in pd.read_csv(path, chunksize=400_000, low_memory=False):
                chunk.columns = [c.strip().lower() for c in chunk.columns]
                cols = set(chunk.columns)
                sym = first_col(cols, ["underlying_symbol", "root", "symbol"])
                dt = first_col(cols, ["quote_date", "date"])
                exp = first_col(cols, ["expiration", "expiry"])
                typ = first_col(cols, ["option_type", "type", "call_put"])
                ivc = first_col(cols, ["implied_volatility_1545", "implied_volatility", "iv"])
                bid = first_col(cols, ["bid_1545", "bid", "bid_eod"])
                spot = first_col(cols, ["active_underlying_price_1545", "implied_underlying_price_1545", "underlying_price", "underlying_close"])
                ubid = first_col(cols, ["underlying_bid_1545", "underlying_bid_eod"])
                uask = first_col(cols, ["underlying_ask_1545", "underlying_ask_eod"])
                missing = [n for n, v in [("symbol", sym), ("quote_date", dt), ("expiration", exp),
                                          ("strike", "strike" if "strike" in cols else None),
                                          ("option_type", typ), ("implied volatility", ivc)] if v is None]
                if missing:
                    sys.exit(f"{path}: missing columns: {', '.join(missing)}")
                if spot is None and not (ubid and uask):
                    sys.exit(f"{path}: no underlying price column found")
                # Filter tickers early
                chunk = chunk[chunk[sym].astype(str).str.upper().isin(tickers)]
                if chunk.empty:
                    continue
                total_rows += len(chunk)
                out = pd.DataFrame({
                    "sym": chunk[sym].astype(str).str.upper(),
                    "date": pd.to_datetime(chunk[dt]),
                    "exp": pd.to_datetime(chunk[exp]),
                    "k": pd.to_numeric(chunk["strike"], errors="coerce"),
                    "cp": chunk[typ].astype(str).str.upper().str[0],
                    "iv": pd.to_numeric(chunk[ivc], errors="coerce"),
                })
                if spot is not None:
                    out["s"] = pd.to_numeric(chunk[spot], errors="coerce")
                else:
                    out["s"] = (pd.to_numeric(chunk[ubid], errors="coerce") + pd.to_numeric(chunk[uask], errors="coerce")) / 2
                out["bid"] = pd.to_numeric(chunk[bid], errors="coerce") if bid else 1.0
                out["dte"] = (out["exp"] - out["date"]).dt.days
                out["x"] = np.log(out["k"] / out["s"])
                keep = (
                    (out["iv"] > 0.01) & (out["iv"] < 4) & (out["bid"] > 0) & (out["s"] > 0)
                    & (out["dte"] >= MIN_DTE) & (out["dte"] <= MAX_DTE) & (out["x"].abs() <= 0.25)
                    & (((out["cp"] == "P") & (out["x"] < 0)) | ((out["cp"] == "C") & (out["x"] > 0)))
                )
                out = out[keep]
                kept_rows += len(out)
                for t, g in out.groupby("sym"):
                    frames[t].append(g[["date", "exp", "dte", "x", "iv", "s"]])
        except Exception as e:
            print(f"  failed {path}: {e}", file=sys.stderr)
            continue
    print(f"  scanned {total_rows} rows, kept {kept_rows} for fit")
    return {t: (pd.concat(v, ignore_index=True) if v else None) for t, v in frames.items()}

def fit_expiry(x, iv):
    o = np.argsort(x)
    x, iv = x[o], iv[o]
    near = np.abs(x) <= 0.035
    if near.sum() < 2 or x[near].min() > 0 or x[near].max() < 0:
        return None
    atm = float(np.interp(0.0, x[near], iv[near]))
    if not np.isfinite(atm) or atm <= 0:
        return None
    y = iv / atm - 1.0
    pm = (x < -0.01) & (x >= -0.15)
    cm = (x > 0.01) & (x <= 0.10)
    sp = -float((x[pm] * y[pm]).sum() / (x[pm] ** 2).sum()) if pm.sum() >= 3 else 2.0
    sc = -float((x[cm] * y[cm]).sum() / (x[cm] ** 2).sum()) if cm.sum() >= 2 else 1.0
    return atm, float(np.clip(sp, 0.0, 6.0)), float(np.clip(sc, -4.0, 6.0))

def build_surface(df):
    days, spot, atm_all, sp_all, sc_all = [], [], [], [], []
    for d, gd in df.groupby("date"):
        dte_l, a_l, p_l, c_l = [], [], [], []
        for (e, dte), ge in gd.groupby(["exp", "dte"]):
            r = fit_expiry(ge["x"].to_numpy(), ge["iv"].to_numpy())
            if r:
                dte_l.append(dte); a_l.append(r[0]); p_l.append(r[1]); c_l.append(r[2])
        if not dte_l:
            continue
        o = np.argsort(dte_l)
        dv = np.array(dte_l)[o]
        days.append(int(d.replace(tzinfo=timezone.utc).timestamp() // 86400))
        spot.append(float(gd["s"].median()))
        atm_all.append(np.interp(TENORS, dv, np.array(a_l)[o], left=np.array(a_l)[o][0], right=np.array(a_l)[o][-1]))
        sp_all.append(np.interp(TENORS, dv, np.array(p_l)[o], left=np.array(p_l)[o][0], right=np.array(p_l)[o][-1]))
        sc_all.append(np.interp(TENORS, dv, np.array(c_l)[o], left=np.array(c_l)[o][0], right=np.array(c_l)[o][-1]))
    return days, spot, atm_all, sp_all, sc_all

def merge_trim(path, ticker, days, spot, atm, sp, sc, q, keep_days):
    rows = {}
    nt = len(TENORS)
    if os.path.exists(path):
        try:
            old = json.load(open(path))
            if old.get("tenors") == TENORS:
                for i, d in enumerate(old["dates"]):
                    rows[d] = (old["spot"][i], old["atm"][i * nt:(i + 1) * nt],
                               old["sp"][i * nt:(i + 1) * nt], old["sc"][i * nt:(i + 1) * nt])
                q = old.get("q", q) if q is None else q
        except Exception as e:
            print(f"  could not merge {path}: {e}")
    for i, d in enumerate(days):
        rows[d] = (spot[i], list(atm[i]), list(sp[i]), list(sc[i]))
    ds = sorted(rows)
    if ds:
        cutoff = ds[-1] - keep_days
        ds = [d for d in ds if d >= cutoff]
    flat = lambda k: [round(float(v), 4) for d in ds for v in rows[d][k]]
    return {
        "v": 2, "ticker": ticker, "q": 0.013 if q is None else q,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "tenors": TENORS, "dates": ds, "spot": [round(rows[d][0], 4) for d in ds],
        "atm": flat(1), "sp": flat(2), "sc": flat(3),
        "meta": {"source": "CBOE DataShop EOD", "model": "iv(K)=atm*(1-slope*ln(K/S))"}
    }

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="inp", nargs="+", required=True, help="CBOE CSV files or globs")
    ap.add_argument("--out", required=True, help="output folder for surface .json files")
    ap.add_argument("--tickers", nargs="+", required=True, help="up to 20 tickers")
    ap.add_argument("--keep", default=DEFAULT_KEEP, help="how much to keep: 2y, 3y, or days int (default 3y)")
    ap.add_argument("--div", nargs="*", default=[], help="dividend yields, e.g. SPY=0.013 AAPL=0.005")
    ap.add_argument("--popular", action="store_true", help="use built-in popular 20 list if --tickers not provided")
    a = ap.parse_args()

    tickers = [t.upper() for t in a.tickers] if a.tickers else POPULAR_20
    if len(tickers) > MAX_TICKERS:
        sys.exit(f"Limit is {MAX_TICKERS} tickers; got {len(tickers)}")
    keep_days = parse_keep(a.keep)
    print(f"keep {a.keep} -> {keep_days} days, tickers: {', '.join(tickers)}")

    os.makedirs(a.out, exist_ok=True)
    existing = {os.path.splitext(f)[0] for f in os.listdir(a.out) if f.endswith(".json") and f != "manifest.json"}
    if len(existing | set(tickers)) > MAX_TICKERS:
        print(f"Warning: output folder would hold {len(existing | set(tickers))} > {MAX_TICKERS}, trimming to requested", file=sys.stderr)

    divs = {}
    for x in a.div:
        if "=" in x:
            k,v = x.split("=",1)
            divs[k.upper()] = float(v)

    paths = sorted({p for pat in a.inp for p in glob.glob(pat)})
    if not paths:
        print("No input files matched, will just trim existing files")
        # still trim existing
        for t in tickers:
            p = os.path.join(a.out, f"{t}.json")
            if os.path.exists(p):
                old = json.load(open(p))
                # re-trim
                ds = old["dates"]
                if ds:
                    cutoff = ds[-1] - keep_days
                    # find index
                    keep_idx = [i for i,d in enumerate(ds) if d >= cutoff]
                    if len(keep_idx) < len(ds):
                        nt = len(TENORS)
                        new = {
                            **old,
                            "dates": [ds[i] for i in keep_idx],
                            "spot": [old["spot"][i] for i in keep_idx],
                            "atm": [v for i in keep_idx for v in old["atm"][i*nt:(i+1)*nt]],
                            "sp": [v for i in keep_idx for v in old["sp"][i*nt:(i+1)*nt]],
                            "sc": [v for i in keep_idx for v in old["sc"][i*nt:(i+1)*nt]],
                            "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d")
                        }
                        json.dump(new, open(p,"w"), separators=(",",":"))
                        print(f"{t}: trimmed to {len(new['dates'])} days")
        # write manifest and exit
        manifest = []
        for f in sorted(os.listdir(a.out)):
            if f.endswith(".json") and f != "manifest.json":
                try:
                    j = json.load(open(os.path.join(a.out, f)))
                    manifest.append({"ticker": j["ticker"], "days": len(j["dates"]), "updated": j["updated"], "first": j["dates"][0] if j["dates"] else None, "last": j["dates"][-1] if j["dates"] else None})
                except: pass
        json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), indent=2)
        return

    data = load_filtered(paths, tickers)
    for t in tickers:
        df = data.get(t)
        if df is None or df.empty:
            print(f"{t}: no usable rows found, skipped (will keep existing if any)")
            continue
        days, spot, atm, sp, sc = build_surface(df)
        if not days:
            print(f"{t}: could not fit any days, skipped")
            continue
        out = merge_trim(os.path.join(a.out, f"{t}.json"), t, days, spot, atm, sp, sc, divs.get(t), keep_days)
        json.dump(out, open(os.path.join(a.out, f"{t}.json"), "w"), separators=(",", ":"))
        first = datetime.fromtimestamp(out["dates"][0] * 86400, timezone.utc).date() if out["dates"] else "?"
        last = datetime.fromtimestamp(out["dates"][-1] * 86400, timezone.utc).date() if out["dates"] else "?"
        print(f"{t}: {len(out['dates'])} days, {first} to {last}")

    manifest = []
    for f in sorted(os.listdir(a.out)):
        if f.endswith(".json") and f != "manifest.json":
            try:
                j = json.load(open(os.path.join(a.out, f)))
                manifest.append({"ticker": j["ticker"], "days": len(j["dates"]), "updated": j["updated"], "first": j["dates"][0] if j["dates"] else None, "last": j["dates"][-1] if j["dates"] else None, "q": j.get("q")})
            except Exception as e:
                print(f"manifest skip {f}: {e}")
    json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), indent=2)
    print(f"manifest: {len(manifest)} tickers")

if __name__ == "__main__":
    main()
