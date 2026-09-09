JSM Options — traditional static site (Cloudflare Pages friendly)
No build step. Upload the jsm-options.com folder (or its contents) to Pages.

Structure:
  /                 Home (3 levels + builder)
  /level1/          Basics + images
  /level2/          First trades + Greeks intro
  /level3/          Verticals + iron condor → Builder deep links
  /builder/         Interactive simulator (?template=iron_condor etc.)
  /images/          Lesson webp assets
  /assets/style.css Shared theme (matches Builder)
  /about /contact /disclaimer /privacy

GA: G-BDL003RCN6
ads.txt at root

Builder query templates:
  long_call, long_put, bull_call_spread, bear_put_spread, iron_condor,
  long_straddle, short_straddle, iron_butterfly, calendar_call, ...
