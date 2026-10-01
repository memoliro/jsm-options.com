#!/usr/bin/env python3
"""Fit the same compact surface as cboe_to_surface.py from a free EOD chain file.

Use this only when the file has strike, expiry, call/put, bid, and IV.
SPY, QQQ, and IWM from the public options-dataset-hist mirror qualify.
Names that only have an ATM IV number do not — do not invent a skew for those.

  python scripts/hist_to_surface.py --in spy2024.parquet spy2025.parquet \
      --ticker SPY --spot-json SPY.json --out backtest/data/surfaces --keep 3y
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

import duckdb
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cboe_to_surface as fit


def load_spot(path):
    raw = json.load(open(path))
    res = raw["chart"]["result"][0]
    out = {}
    for sec, close in zip(res["timestamp"], res["indicators"]["quote"][0]["close"]):
        if close is None:
            continue
        day = datetime.fromtimestamp(sec, timezone.utc).date().isoformat()
        out[day] = float(close)
    return out


def load_chain(paths, ticker, spot):
    frames = []
    for path in paths:
        print(f"reading {path}", flush=True)
        rows = duckdb.execute(
            f"""
            SELECT date, expiration, strike, lower(type) AS cp,
                   implied_volatility AS iv, bid
            FROM read_parquet('{path}')
            WHERE implied_volatility > 0.01 AND implied_volatility < 4
              AND bid > 0 AND strike > 0
            """
        ).fetchdf()
        rows["date"] = pd.to_datetime(rows["date"])
        rows["exp"] = pd.to_datetime(rows["expiration"])
        rows["dte"] = (rows["exp"] - rows["date"]).dt.days
        rows["s"] = rows["date"].dt.strftime("%Y-%m-%d").map(spot)
        rows = rows[rows["s"].notna() & (rows["s"] > 0)]
        rows["k"] = pd.to_numeric(rows["strike"], errors="coerce")
        rows["x"] = (rows["k"] / rows["s"]).map(lambda v: __import__("math").log(v) if v and v > 0 else float("nan"))
        rows["cp"] = rows["cp"].astype(str).str[0].str.upper()
        keep = (
            (rows["dte"] >= fit.MIN_DTE) & (rows["dte"] <= fit.MAX_DTE)
            & (rows["x"].abs() <= 0.25)
            & (((rows["cp"] == "P") & (rows["x"] < 0)) | ((rows["cp"] == "C") & (rows["x"] > 0)))
        )
        frames.append(rows.loc[keep, ["date", "exp", "dte", "x", "iv", "s"]])
        print(f"  kept {int(keep.sum())} rows", flush=True)
    return pd.concat(frames, ignore_index=True) if frames else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="inp", nargs="+", required=True)
    ap.add_argument("--ticker", required=True)
    ap.add_argument("--spot-json", required=True, help="Yahoo chart JSON for the underlying close")
    ap.add_argument("--out", required=True)
    ap.add_argument("--keep", default="3y")
    ap.add_argument("--div", type=float, default=None)
    a = ap.parse_args()
    ticker = a.ticker.upper()
    os.makedirs(a.out, exist_ok=True)
    df = load_chain(a.inp, ticker, load_spot(a.spot_json))
    if df is None or df.empty:
        sys.exit(f"{ticker}: no usable chain rows")
    days, spot, atm, sp, sc = fit.build_surface(df)
    if not days:
        sys.exit(f"{ticker}: fit produced no days")
    # Do not merge an older ATM-only file. Its tenor list does not match.
    dest = os.path.join(a.out, f"{ticker}.json")
    if os.path.exists(dest):
        old = json.load(open(dest))
        if old.get("tenors") != fit.TENORS:
            os.remove(dest)
    out = fit.merge_trim(dest, ticker, days, spot, atm, sp, sc, a.div, fit.parse_keep(a.keep))
    out["meta"] = {
        "source": "options-dataset-hist EOD chain, fit with cboe_to_surface",
        "model": "iv(K)=atm*(1-slope*ln(K/S))",
        "note": "Real chain fit. Not a CBOE DataShop file.",
    }
    json.dump(out, open(dest, "w"), separators=(",", ":"))
    first = datetime.fromtimestamp(out["dates"][0] * 86400, timezone.utc).date()
    last = datetime.fromtimestamp(out["dates"][-1] * 86400, timezone.utc).date()
    print(f"{ticker}: {len(out['dates'])} days, {first} to {last}")


if __name__ == "__main__":
    main()
