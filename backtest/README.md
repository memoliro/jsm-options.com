# /backtest/ - Options Backtest Lab

Live at jsm-options.com/backtest/

Features:
- 24 strategies grouped: Bullish, Bearish, Neutral, Synthetic (after Builder in nav)
- DTE 45 default, editable (bug fixed)
- Built-in 2-year CBOE surfaces for SPY, QQQ, IWM, AAPL, TSLA, SPX (stored in /data/surfaces/)
- No CSV upload needed - auto-loads historical data
- Live chain via /api/cboe/chain?symbol=SPY for payoff
- Save backtests in browser (localStorage), Export/Import
- Intraday exit checks, Roll-out on PT/21 DTE
