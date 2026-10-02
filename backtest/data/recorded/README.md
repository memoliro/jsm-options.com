# Recorded options history — schema contract

This directory holds the **recorded** dataset: daily EOD snapshots of the
options surface, one file per ticker, grown day-by-day by the recorder job
(GitHub Actions). It is **separate** from `../surfaces/` (the archive: one
fitted ATM IV per day). One ticker = one canonical recorded file; do not
keep two parallel truths for the same ticker/day.

## File layout

`{TICKER}.json` — flat arrays (same style as `../surfaces/`):

```json
{
  "ticker": "SPY",
  "tenors": [7, 14, 30, 60, 90, 180, 365],
  "points": ["p25", "atm", "c25"],
  "meta": {
    "source": "CBOE EOD delayed quotes, snapshot after close",
    "asof": "2026-10-02",
    "notes": "spot = raw close; spotAdj = split/dividend-adjusted close"
  },
  "dates": [19724, 19725, ...],
  "spot": [475.12, ...],
  "spotAdj": [474.30, ...],
  "iv": [ ... ]
}
```

- `dates`: epoch **days** (days since 1970-01-01, UTC), strictly increasing,
  trading days only — no rows for weekends/holidays.
- `spot`: raw daily close. `spotAdj`: split/dividend-adjusted close.
  The backtester prices off `spotAdj` (falls back to `spot`).
- `iv`: for each day, `len(tenors) * 3` values in tenor-major order, and
  inside each tenor `[p25, atm, c25]` (25-delta put IV, ATM IV, 25-delta
  call IV, as decimals e.g. `0.1842`). Index of a value:
  `(dayIndex * nTenors + tenorIndex) * 3 + pointIndex`.
- `tenors` and `points` must be identical in every file.

## Recorder rules (the GitHub job must follow these)

1. **Idempotent**: if the last row's date is today (or the latest trading
   day), write nothing. Never duplicate a date.
2. **Immutable raws**: never rewrite a recorded day. Fix bad prints in a
   derived file, not here.
3. **Validate before commit** — reject the whole day's row (and fail loudly,
   don't commit partial data) if any of these fail:
   - `spot > 0`, `spotAdj > 0`
   - every IV in `(0.005, 3.0)`
   - `p25 >= atm * 0.8` and `c25 <= atm * 1.2` (smile sanity; wings shouldn't
     invert the surface)
   - date is a trading day and greater than the previous last date
4. Update `manifest.json` in the same commit:
   `[{"ticker":"SPY","days":491,"asof":"2026-10-03","source":"..."}]`.
5. One commit per run, message like `record: SPY 2026-10-03`.

## How the page uses it

`/backtest/` (and `/tr/backtest/`) offer **Recorded history (7-tenor
surface)** in the Market data → Source dropdown. The loader reads
`./data/recorded/{TICKER}.json`, uses the **30-day ATM** tenor for pricing
(identical to the archive path today), and keeps the full 7-tenor ×
3-point grid in memory for future term-structure / skew features.

## Current status

- `SPY.json` is a **synthetic sample** (`meta.sample: true`) so the
  dropdown option works end-to-end before the recorder is live. Replace it
  with real CBOE recordings; do not extend the sample.
