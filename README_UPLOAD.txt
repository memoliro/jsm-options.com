UPLOAD INSTRUCTIONS (drag & drop, no command line):

1. Go to github.com/memoliro/jsm-options.com
2. Click Add file -> Upload files

3. Drag these:

- backtest/ folder (whole folder) -> will create /backtest/index.html at jsm-options.com/backtest/
- data/ folder (whole folder) -> /data/surfaces/*.json (6 tickers, 2y each, ~400KB) - historical data for backtest, no upload needed by users
- functions/api/cboe/chain.js -> overwrites existing delayed CBOE proxy (improved)
- assets/site.js -> adds Backtest after Builder in nav (patched from your current site.js)
- scripts/cboe_to_surface.py -> optional, for monthly updates to 20 tickers

4. Commit changes

5. Cloudflare Pages deploys ~1 min, visit jsm-options.com/backtest/

Historical data is now built-in:
- backtest page auto-fetches /data/surfaces/manifest.json
- loads SPY 2y surface by default
- users can switch ticker via dropdown (SPY, QQQ, IWM, AAPL, TSLA, SPX)
- No CSV upload required

To update monthly to 3y / 20 tickers:
- Drop new CBOE DataShop CSVs into cboe_inbox/ locally
- python scripts/cboe_to_surface.py --in "cboe_inbox/*.csv" --out data/surfaces --keep 3y --tickers SPY QQQ IWM DIA AAPL MSFT NVDA TSLA META GOOGL AMZN SPX NDX RUT XLF XLK SMH TLT GLD VIX
- Upload new data/surfaces/*.json via GitHub
