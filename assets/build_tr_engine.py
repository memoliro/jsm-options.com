#!/usr/bin/env python3
"""
build_tr_engine.py — build the Turkish engine from the English one.

    python3 build_tr_engine.py jsm-options-engine.js jsm-options-engine.tr.js

How it works
  * jsm-options-engine.js stays the single source of truth (English).
  * TABLE below maps an English source line (whitespace-trimmed) to its Turkish
    replacement. Every line of the engine whose trimmed text equals a key is
    replaced; indentation is kept. Everything else is copied unchanged.
  * If the English engine changes and a key no longer matches, that string simply
    stays English and is listed under "UNMATCHED" so you can update the table.

Kept in English on purpose (not in TABLE): strategy names and the trading terms
Call, Put, Strike, Expiry, Premium, Long, Short, Greeks, Delta, Gamma, Theta, Vega,
IV, Debit, Credit, Roll, Payoff, Break-Even, Spread, Earnings, ... and logic values
the code compares against (e.g. 'modeled').
"""
import re, sys

TABLE = [
 [
  "' · P/L now <strong class=\"' + (pl >= 0 ? 'up' : 'down') + '\">' + (pl >= 0 ? '+' : '') + formatMoney(pl) + '</strong>' +",
  "' · P/L şimdi <strong class=\"' + (pl >= 0 ? 'up' : 'down') + '\">' + (pl >= 0 ? '+' : '') + formatMoney(pl) + '</strong>' +"
 ],
 [
  "' — day ' + ev.day + '</title></line>';",
  "' — gün ' + ev.day + '</title></line>';"
 ],
 [
  "'\" — press Enter to try it if it has market data, or clear the field to browse the list.</div>';",
  "'\" listede yok — piyasa verisi varsa denemek için Enter\\'a basın, ya da listeye göz atmak için alanı temizleyin.</div>';"
 ],
 [
  "'<br>Max loss ' + sumA.maxLoss + '<br>Return on risk ' + sumA.ror +",
  "'<br>Maks zarar ' + sumA.maxLoss + '<br>Risk getirisi ' + sumA.ror +"
 ],
 [
  "'<br>Max loss ' + sumB.maxLoss + '<br>Return on risk ' + sumB.ror +",
  "'<br>Maks zarar ' + sumB.maxLoss + '<br>Risk getirisi ' + sumB.ror +"
 ],
 [
  "'<button class=\"btn-danger\" onclick=\"removeLeg(' + l.id + ')\" title=\"Remove leg\">✕</button>' +",
  "'<button class=\"btn-danger\" onclick=\"removeLeg(' + l.id + ')\" title=\"Bacağı kaldır\">✕</button>' +"
 ],
 [
  "'<button type=\"button\" class=\"btn-secondary btn-sm\" onclick=\"clearRecentBuilds()\">Clear all</button></div>';",
  "'<button type=\"button\" class=\"btn-secondary btn-sm\" onclick=\"clearRecentBuilds()\">Tümünü temizle</button></div>';"
 ],
 [
  "'<button type=\"button\" class=\"btn-sm\" onclick=\"armPaperTrade(\\'' + t.id + '\\',\\'close\\')\">' + (armedClose ? 'Confirm close' : 'Close trade') + '</button> ' +",
  "'<button type=\"button\" class=\"btn-sm\" onclick=\"armPaperTrade(\\'' + t.id + '\\',\\'close\\')\">' + (armedClose ? 'Kapatmayı onayla' : 'İşlemi kapat') + '</button> ' +"
 ],
 [
  "'<button type=\"button\" class=\"btn-sm\" onclick=\"armPaperTrade(\\'' + t.id + '\\',\\'delete\\')\">' + (armedDel ? 'Confirm delete' : 'Delete') + '</button>' +",
  "'<button type=\"button\" class=\"btn-sm\" onclick=\"armPaperTrade(\\'' + t.id + '\\',\\'delete\\')\">' + (armedDel ? 'Silmeyi onayla' : 'Sil') + '</button>' +"
 ],
 [
  "'<button type=\"button\" class=\"recent-del\" title=\"Remove\" onclick=\"event.stopPropagation();deleteRecentBuild(' + i + ')\">✕</button></div>';",
  "'<button type=\"button\" class=\"recent-del\" title=\"Kaldır\" onclick=\"event.stopPropagation();deleteRecentBuild(' + i + ')\">✕</button></div>';"
 ],
 [
  "'<input type=\"number\" value=\"' + premiumVal + '\" step=\"0.05\" min=\"0\" title=\"' + premiumTitle + '\" placeholder=\"Enter price\" ' +",
  "'<input type=\"number\" value=\"' + premiumVal + '\" step=\"0.05\" min=\"0\" title=\"' + premiumTitle + '\" placeholder=\"Fiyat girin\" ' +"
 ],
 [
  "'<option value=\"buy\"' + sideBuy + '>Buy (Long)</option>' +",
  "'<option value=\"buy\"' + sideBuy + '>Al (Long)</option>' +"
 ],
 [
  "'<option value=\"sell\"' + sideSell + '>Sell (Short)</option>' +",
  "'<option value=\"sell\"' + sideSell + '>Sat (Short)</option>' +"
 ],
 [
  "'<p class=\"disc-empty\">Model another roll above, or tweak the legs.</p>';",
  "'<p class=\"disc-empty\">Yukarıdan başka bir roll modelleyin veya bacakları ayarlayın.</p>';"
 ],
 [
  "'<span style=\"font-size:.68rem;color:var(--muted)\">Stored only in this browser</span>' +",
  "'<span style=\"font-size:.68rem;color:var(--muted)\">Yalnızca bu tarayıcıda saklanır</span>' +"
 ],
 [
  "'<td><button type=\"button\" class=\"btn-primary btn-sm\" onclick=\"applyDiscoveryLegs(\\'find\\',' + i + ')\">Apply</button></td></tr>';",
  "'<td><button type=\"button\" class=\"btn-primary btn-sm\" onclick=\"applyDiscoveryLegs(\\'find\\',' + i + ')\">Uygula</button></td></tr>';"
 ],
 [
  "'<td><button type=\"button\" class=\"btn-primary btn-sm\" onclick=\"applyDiscoveryLegs(\\'opt\\',' + i + ')\">Apply</button></td></tr>';",
  "'<td><button type=\"button\" class=\"btn-primary btn-sm\" onclick=\"applyDiscoveryLegs(\\'opt\\',' + i + ')\">Uygula</button></td></tr>';"
 ],
 [
  "'P/L now ' + formatMoney(plA) + '<br>Max profit ' + sumA.maxProfit +",
  "'P/L şimdi ' + formatMoney(plA) + '<br>Maks kâr ' + sumA.maxProfit +"
 ],
 [
  "'P/L now ' + formatMoney(plB) + '<br>Max profit ' + sumB.maxProfit +",
  "'P/L şimdi ' + formatMoney(plB) + '<br>Maks kâr ' + sumB.maxProfit +"
 ],
 [
  "'title=\"Leg Symbol; blank uses strategy ticker\" style=\"text-transform:uppercase\" ' +",
  "'title=\"Bacak Sembolü; boş bırakılırsa strateji sembolü kullanılır\" style=\"text-transform:uppercase\" ' +"
 ],
 [
  "(armedClose || armedDel ? ' <button type=\"button\" class=\"btn-sm\" onclick=\"disarmPaperTrade()\">Cancel</button>' : '') +",
  "(armedClose || armedDel ? ' <button type=\"button\" class=\"btn-sm\" onclick=\"disarmPaperTrade()\">İptal</button>' : '') +"
 ],
 [
  "(paperArmedId === t.id ? ' <button type=\"button\" class=\"btn-sm\" onclick=\"disarmPaperTrade()\">Cancel</button>' : '') + '</p>';",
  "(paperArmedId === t.id ? ' <button type=\"button\" class=\"btn-sm\" onclick=\"disarmPaperTrade()\">İptal</button>' : '') + '</p>';"
 ],
 [
  "(paperArmedId === t.id ? 'Confirm delete' : 'Delete') + '</button>' +",
  "(paperArmedId === t.id ? 'Silmeyi onayla' : 'Sil') + '</button>' +"
 ],
 [
  "(q.exchange ? '  ·  ' + q.exchange : '') + '  — No Bid/Ask chain; Premium stays modeled.', 'ok');",
  "(q.exchange ? '  ·  ' + q.exchange : '') + '  — Bid/Ask zinciri yok; Premium modellenmiş kalır.', 'ok');"
 ],
 [
  "(u.modeled ? ' <span class=\"disc-sub\">(partly modeled)</span>' : ' <span class=\"disc-sub\">(chain)</span>') + '</div>';",
  "(u.modeled ? ' <span class=\"disc-sub\">(kısmen modellenmiş)</span>' : ' <span class=\"disc-sub\">(zincir)</span>') + '</div>';"
 ],
 [
  ": '<input type=\"number\" value=\"' + (l.strike == null ? '' : l.strike) + '\" step=\"' + strikeStep + '\" min=\"0.000001\" placeholder=\"Enter strike\" ' +",
  ": '<input type=\"number\" value=\"' + (l.strike == null ? '' : l.strike) + '\" step=\"' + strikeStep + '\" min=\"0.000001\" placeholder=\"Strike girin\" ' +"
 ],
 [
  ": 'Daily Theta is small at these settings.';",
  ": 'Bu ayarlarda günlük Theta küçüktür.';"
 ],
 [
  ": 'Expiry Payoff · hover to preview · click to load';",
  ": 'Expiry Payoff · önizleme için gezinin · yüklemek için tıklayın';"
 ],
 [
  ": 'Low Gamma: on small price moves Delta stays relatively stable.';",
  ": 'Düşük Gamma: küçük fiyat hareketlerinde Delta görece sabit kalır.';"
 ],
 [
  ": 'Low Rho: rate moves matter little right now.';",
  ": 'Düşük Rho: faiz hareketleri şu an pek önemli değil.';"
 ],
 [
  ": 'Low Vega: IV moves matter little right now.';",
  ": 'Düşük Vega: IV hareketleri şu an pek önemli değil.';"
 ],
 [
  ": 'Near delta-neutral: a small price move has little directional P/L.';",
  ": 'Near delta-neutral: küçük bir fiyat hareketinin yönlü P/L\\'si azdır.';"
 ],
 [
  ": rh < -5 ? 'Rates hurt: +1% rates costs about $' + Math.abs(rh).toFixed(0) + '.'",
  ": rh < -5 ? 'Faizler aleyhinize: faizler +1% olursa yaklaşık $' + Math.abs(rh).toFixed(0) + ' kaybettirir.'"
 ],
 [
  ": th > 5 ? 'Time in your favor: about $' + Math.abs(th).toFixed(0) + ' of Theta expected.'",
  ": th > 5 ? 'Zaman lehinize: yaklaşık $' + Math.abs(th).toFixed(0) + ' Theta bekleniyor.'"
 ],
 [
  ": vg < -5 ? 'Short volatility: +1% IV is about $' + Math.abs(vg).toFixed(0) + ' of loss; you profit if IV falls.'",
  ": vg < -5 ? 'Short volatilite: IV +1% olursa yaklaşık $' + Math.abs(vg).toFixed(0) + ' zarar; IV düşerse kazanırsınız.'"
 ],
 [
  "? '<input type=\"text\" value=\"—\" disabled title=\"Not used for stock\" style=\"opacity:0.45;cursor:not-allowed;\" />'",
  "? '<input type=\"text\" value=\"—\" disabled title=\"Hisse için kullanılmaz\" style=\"opacity:0.45;cursor:not-allowed;\" />'"
 ],
 [
  "? 'High Gamma: Delta shifts fast when Underlying moves — P/L can accelerate.'",
  "? 'Yüksek Gamma: Underlying hareket edince Delta hızlı değişir — P/L hızlanabilir.'"
 ],
 [
  "? (l.side === 'buy' ? 'Stock cost ' : 'Stock credit ') + cashTxt + ' (' + l.qty + ' shares)'",
  "? (l.side === 'buy' ? 'Stock maliyeti ' : 'Stock Credit ') + cashTxt + ' (' + l.qty + ' hisse)'"
 ],
 [
  "? (leg.side === 'buy' ? 'Stock cost ' : 'Stock credit ') + cashTxt + ' (' + leg.qty + ' shares)'",
  "? (leg.side === 'buy' ? 'Stock maliyeti ' : 'Stock Credit ') + cashTxt + ' (' + leg.qty + ' hisse)'"
 ],
 [
  "`<button type=\"button\" class=\"ba ba-ask\" title=\"Buy at the ask $${a.toFixed(2)}\" onclick=\"addLegFromChain('${type}', ${strike}, ${a}, '${expStr}', 'buy')\">${a.toFixed(2)}</button></td>`;",
  "`<button type=\"button\" class=\"ba ba-ask\" title=\"Ask'ten al $${a.toFixed(2)}\" onclick=\"addLegFromChain('${type}', ${strike}, ${a}, '${expStr}', 'buy')\">${a.toFixed(2)}</button></td>`;"
 ],
 [
  "`<button type=\"button\" class=\"ba ba-bid\" title=\"Sell at the bid $${b.toFixed(2)}\" onclick=\"addLegFromChain('${type}', ${strike}, ${b}, '${expStr}', 'sell')\">${b.toFixed(2)}</button>` +",
  "`<button type=\"button\" class=\"ba ba-bid\" title=\"Bid'den sat $${b.toFixed(2)}\" onclick=\"addLegFromChain('${type}', ${strike}, ${b}, '${expStr}', 'sell')\">${b.toFixed(2)}</button>` +"
 ],
 [
  "add('exDivDate', 'D', '#a78bfa', 'Ex-dividend');",
  "add('exDivDate', 'D', '#a78bfa', 'Temettü kesimi');"
 ],
 [
  "alert('This browser cannot export the chart.');",
  "alert('Bu tarayıcı grafiği dışa aktaramıyor.');"
 ],
 [
  "bear_put_spread: { title: 'Bear Put Spread', href: '/level3/', label: 'Spreads' },",
  "bear_put_spread: { title: 'Bear Put Spread', href: '/level3/', label: 'Spreadler' },"
 ],
 [
  "beyEl.title = 'Estimated chance the underlying expires ' + dir + ' $' + s.price + ' (lognormal, current IV).';",
  "beyEl.title = 'Dayanağın $' + s.price + '\\'in ' + dir + ' bitme olasılığı tahmini (lognormal, mevcut IV).';"
 ],
 [
  "box.innerHTML = '<div class=\"ts-empty\">No preset match for \"' + (input.value || '').toUpperCase() +",
  "box.innerHTML = '<div class=\"ts-empty\">\"' + (input.value || '').toUpperCase() +"
 ],
 [
  "box.innerHTML = '<p class=\"disc-empty\">Enter a new strike to model the roll.</p>';",
  "box.innerHTML = '<p class=\"disc-empty\">Roll\\'u modellemek için yeni bir strike girin.</p>';"
 ],
 [
  "box.innerHTML = '<p class=\"disc-empty\">No paper trades yet — build a position above and save it here to track how it would have done.</p>';",
  "box.innerHTML = '<p class=\"disc-empty\">Henüz kâğıt işlem yok — yukarıda bir pozisyon kurup buraya kaydederek nasıl performans göstereceğini takip edin.</p>';"
 ],
 [
  "box.innerHTML = h + '</tbody></table><p class=\"disc-note\">est. stats · Apply replaces legs A</p>';",
  "box.innerHTML = h + '</tbody></table><p class=\"disc-note\">tahm. istatistikler · Uygula A bacaklarını değiştirir</p>';"
 ],
 [
  "breakeven: 'LEAPS strike + net debit paid.',",
  "breakeven: 'LEAPS Strike + ödenen net Debit.',"
 ],
 [
  "breakeven: 'Long (lower) strike + net debit.',",
  "breakeven: 'Long (düşük) Strike + net Debit.',"
 ],
 [
  "breakeven: 'One breakeven, on the downside: short put strike − total credit.',",
  "breakeven: 'Tek break-even, aşağı yönde: short put strike − toplam credit.',"
 ],
 [
  "breakeven: 'Stock purchase price − premium received.',",
  "breakeven: 'Stock alış fiyatı − alınan Premium.',"
 ],
 [
  "breakeven: 'Strike price + premium paid per share.',",
  "breakeven: 'Strike fiyatı + hisse başına ödenen premium.',"
 ],
 [
  "breakeven: 'Strike price − premium paid per share.',",
  "breakeven: 'Strike fiyatı − hisse başına ödenen premium.',"
 ],
 [
  "breakeven: 'Strike − premium received.',",
  "breakeven: 'Strike − alınan Premium.',"
 ],
 [
  "breakeven: 'Two breakevens: strike ± total premium paid.',",
  "breakeven: 'İki break-even: strike ± ödenen toplam premium.',"
 ],
 [
  "breakeven: 'Two breakevens: strike ± total premium received.',",
  "breakeven: 'İki break-even: strike ± alınan toplam premium.',"
 ],
 [
  "btn.textContent = compareMode ? 'Exit compare' : 'Compare two strategies';",
  "btn.textContent = compareMode ? 'Karşılaştırmadan çık' : 'İki stratejiyi karşılaştır';"
 ],
 [
  "bull_call_spread: { title: 'Bull Call Spread', href: '/level3/', label: 'Spreads' },",
  "bull_call_spread: { title: 'Bull Call Spread', href: '/level3/', label: 'Spreadler' },"
 ],
 [
  "call_condor: { title: 'Call Condor', href: '/strategies/', label: 'Strategies' },",
  "call_condor: { title: 'Call Condor', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "cash_secured_put: { title: 'Cash-Secured Put', href: '/cash-secured-put/', label: 'CSP guide' },",
  "cash_secured_put: { title: 'Cash-Secured Put', href: '/cash-secured-put/', label: 'CSP rehberi' },"
 ],
 [
  "clearNoChainNote('findResults', 'Enter where you think the price goes — the top 5 by profit at target appear here.');",
  "clearNoChainNote('findResults', 'Fiyatın nereye gideceğini düşündüğünüzü girin — hedefteki kâra göre ilk 5 burada görünür.');"
 ],
 [
  "clearNoChainNote('optResults', 'Pick a family and scan — the top 5 by your goal appear here.');",
  "clearNoChainNote('optResults', 'Bir aile seçip tarayın — hedefinize göre ilk 5 burada görünür.');"
 ],
 [
  "const colDefs = [{ daysLeft: minDte, head: 'Today', sub: today.toISOString().slice(0, 10) }];",
  "const colDefs = [{ daysLeft: minDte, head: 'Bugün', sub: today.toISOString().slice(0, 10) }];"
 ],
 [
  "const dayTxt = days === 1 ? '1 day' : days + ' days';",
  "const dayTxt = days === 1 ? '1 gün' : days + ' gün';"
 ],
 [
  "const dir = s.price >= S ? 'above' : 'below';",
  "const dir = s.price >= S ? '\\u00fcst\\u00fcnde' : 'alt\\u0131nda';"
 ],
 [
  "const dirWord = debit ? 'Debit' : credit ? 'Credit' : 'Even';",
  "const dirWord = debit ? 'Debit' : credit ? 'Credit' : 'Eşit';"
 ],
 [
  "const premiumTitle = isStock ? 'Cost per share (entry)' : 'Option Premium per share';",
  "const premiumTitle = isStock ? 'Hisse başına maliyet (giriş)' : 'Opsiyon Premium (hisse başına)';"
 ],
 [
  "const side = l.side === 'buy' ? 'Buy' : 'Sell';",
  "const side = l.side === 'buy' ? 'Al' : 'Sat';"
 ],
 [
  "covered_call: { title: 'Covered Call', href: '/covered-call/', label: 'Covered Call guide' },",
  "covered_call: { title: 'Covered Call', href: '/covered-call/', label: 'Covered Call rehberi' },"
 ],
 [
  ": d < -5 ? 'Bearish tilt: if Underlying drops $1, P/L ≈ $' + Math.abs(d).toFixed(0) + ' increases.'",
  ": d < -5 ? 'Bearish eğilim: Underlying $1 düşerse P/L yaklaşık $' + Math.abs(d).toFixed(0) + ' artar.'"
 ],
 [
  "d > 5 ? 'Bullish tilt: if Underlying rises $1, P/L ≈ $' + Math.abs(d).toFixed(0) + ' increases.'",
  "d > 5 ? 'Bullish eğilim: Underlying $1 yükselirse P/L yaklaşık $' + Math.abs(d).toFixed(0) + ' artar.'"
 ],
 [
  "else if (tail < 0) maxLossText = 'Unlimited';",
  "else if (tail < 0) maxLossText = 'Sınırsız';"
 ],
 [
  "else if (tailSlope < 0) maxLossText = 'Unlimited';",
  "else if (tailSlope < 0) maxLossText = 'Sınırsız';"
 ],
 [
  "enterManualDataMode(sym, `${sym} is a futures option — no live chain here (use a CME futures-option data source). Contract multiplier: ${spec ? spec.multiplier : '—'}. Enter Spot, Strike and Premium manually.`);",
  "enterManualDataMode(sym, `${sym} bir vadeli opsiyondur — burada canlı zincir yok (bir CME vadeli opsiyon veri kaynağı kullanın). Kontrat çarpanı: ${spec ? spec.multiplier : '—'}. Spot, Strike ve Premium'u manuel girin.`);"
 ],
 [
  "enterManualDataMode(sym, `No market data found for ${sym} (${err && err.message ? err.message : err}). Enter Spot, Strike and Premium manually below — try a listed equity/index ticker such as SPY, QQQ, AAPL, or SPX for a live chain.`);",
  "enterManualDataMode(sym, `${sym} için piyasa verisi bulunamadı (${err && err.message ? err.message : err}). Spot, Strike ve Premium'u aşağıdan manuel girin — canlı zincir için SPY, QQQ, AAPL veya SPX gibi listelenmiş bir hisse/endeks sembolü deneyin.`);"
 ],
 [
  "greeks: 'Delta near +100 — it behaves like shares, with minimal gamma, theta, or vega.',",
  "greeks: 'Delta +100\\'e yakın — hisse gibi davranır; gamma, theta ve vega minimumdur.',"
 ],
 [
  "greeks: 'Delta near −100 — it behaves like short shares, with minimal gamma, theta, or vega.',",
  "greeks: 'Delta −100\\'e yakın — short hisse gibi davranır; gamma, theta ve vega minimumdur.',"
 ],
 [
  "greeks: 'Long delta (gains as the stock rises), long gamma, negative theta (loses a little value every day), long vega (benefits if implied volatility rises).',",
  "greeks: 'Long delta (hisse yükseldikçe kazanır), long gamma, negatif theta (her gün biraz değer kaybeder), long vega (implied volatility yükselirse yararlanır).',"
 ],
 [
  "greeks: 'Long delta (the LEAPS behaves like stock), positive theta and short gamma from the short call, net long vega from the LEAPS.',",
  "greeks: 'Long delta (LEAPS hisse gibi davranır), short call\\'dan pozitif theta ve short gamma, LEAPS\\'ten net long vega.',"
 ],
 [
  "greeks: 'Long delta low, flipping to short delta above the short strike; short gamma up top; positive theta.',",
  "greeks: 'Düşük long delta, short strike üstünde short delta\\'ya döner; üstte short gamma; pozitif theta.',"
 ],
 [
  "greeks: 'Long delta with reduced gamma, vega, and theta versus an outright call — the short leg offsets much of the time decay and volatility exposure.',",
  "greeks: 'Tek başına bir call\\'a göre azaltılmış gamma, vega ve theta ile long delta — short bacak, zaman erimesi ve volatilite riskinin çoğunu dengeler.',"
 ],
 [
  "greeks: 'Long delta; long gamma on the call wing, short gamma on the put wing; roughly theta-neutral.',",
  "greeks: 'Long delta; call kanadında long gamma, put kanadında short gamma; kabaca theta-neutral.',"
 ],
 [
  "greeks: 'Near delta-neutral at the body, long gamma near the middle strike, negative theta — you need the pin, and time works against you.',",
  "greeks: 'Gövdede near delta-neutral, orta strike yakınında long gamma, negatif theta — pin\\'e ihtiyacınız var ve zaman aleyhinize işler.',"
 ],
 [
  "greeks: 'Near delta-neutral at the body, long gamma, negative theta.',",
  "greeks: 'Gövdede near delta-neutral, long gamma, negatif theta.',"
 ],
 [
  "greeks: 'Near delta-neutral at the body, short gamma (sharp near the pin), positive theta, short vega.',",
  "greeks: 'Gövdede near delta-neutral, short gamma (pin yakınında keskin), pozitif theta, short vega.',"
 ],
 [
  "greeks: 'Near delta-neutral at the strike, very long gamma and vega, very negative theta — time is the enemy.',",
  "greeks: 'Strike\\'ta near delta-neutral, çok long gamma ve vega, çok negatif theta — zaman düşmandır.',"
 ],
 [
  "greeks: 'Near delta-neutral at the strike; long vega (rising IV helps the back month more); positive theta near the strike as the front leg melts faster.',",
  "greeks: 'Strike\\'ta near delta-neutral; long vega (yükselen IV arka aya daha çok yarar); ön bacak daha hızlı eridiği için strike yakınında pozitif theta.',"
 ],
 [
  "greeks: 'Near delta-neutral between the strikes, long gamma and vega, negative theta — cheaper than a straddle but hungrier for movement.',",
  "greeks: 'Strike\\'lar arasında near delta-neutral, long gamma ve vega, negatif theta — bir straddle\\'dan ucuz ama harekete daha aç.',"
 ],
 [
  "greeks: 'Near delta-neutral inside the body, long gamma, negative theta — like a butterfly with a wider sweet spot.',",
  "greeks: 'Gövde içinde near delta-neutral, long gamma, negatif theta — daha geniş tatlı noktası olan bir butterfly gibi.',"
 ],
 [
  "greeks: 'Near delta-neutral inside the body, long gamma, negative theta.',",
  "greeks: 'Gövde içinde near delta-neutral, long gamma, negatif theta.',"
 ],
 [
  "greeks: 'Near delta-neutral, short gamma, positive theta, short vega — you are short volatility and long time.',",
  "greeks: 'Near delta-neutral, short gamma, pozitif theta, short vega — volatilitede short, zamanda long\\'sunuz.',"
 ],
 [
  "greeks: 'Near delta-neutral, short gamma, positive theta, short vega. Further OTM = slower decay but more room.',",
  "greeks: 'Near delta-neutral, short gamma, pozitif theta, short vega. Daha uzak OTM = daha yavaş erime ama daha fazla alan.',"
 ],
 [
  "greeks: 'Short delta with reduced gamma, vega, and theta versus an outright put — the short leg offsets much of the time decay.',",
  "greeks: 'Tek başına bir put\\'a göre azaltılmış gamma, vega ve theta ile short delta — short bacak zaman erimesinin çoğunu dengeler.',"
 ],
 [
  "greeks: 'Slightly bullish delta, short gamma on the downside, positive theta, short vega.',",
  "greeks: 'Hafif bullish delta, aşağı yönde short gamma, pozitif theta, short vega.',"
 ],
 [
  "greeks: 'Still net long the stock, but the short call trims delta and adds positive theta — time decay now works for you. You want implied volatility to fall.',",
  "greeks: 'Hâlâ net long hisse, ama short call delta\\'yı kırpar ve pozitif theta ekler — zaman erimesi artık lehinize. Implied volatility\\'nin düşmesini istersiniz.',"
 ],
 [
  "h += '<div class=\"disc-note\">Closed ' + paperDateStr(t.closedAt) + ': <b style=\"color:' + cls + '\">' + (rpnl >= 0 ? '+' : '−') + formatMoney(Math.abs(rpnl)) + '</b> realized</div>';",
  "h += '<div class=\"disc-note\">Kapalı ' + paperDateStr(t.closedAt) + ': <b style=\"color:' + cls + '\">' + (rpnl >= 0 ? '+' : '−') + formatMoney(Math.abs(rpnl)) + '</b> gerçekleşen</div>';"
 ],
 [
  "h += '<div class=\"disc-note\">Entry: ' + entryTxt + ' @ spot ' + formatMoney(t.entrySpot) + '</div>';",
  "h += '<div class=\"disc-note\">Giriş: ' + entryTxt + ' @ spot ' + formatMoney(t.entrySpot) + '</div>';"
 ],
 [
  "h += '<div class=\"disc-title\">' + escapeHtml(t.note || 'Paper trade') +",
  "h += '<div class=\"disc-title\">' + escapeHtml(t.note || 'Kâğıt işlem') +"
 ],
 [
  "h += '<p style=\"font-size:0.82rem;margin:0 0 6px\">Close at ' + formatMoney(r.closeQ.px) +",
  "h += '<p style=\"font-size:0.82rem;margin:0 0 6px\">Kapanış: ' + formatMoney(r.closeQ.px) +"
 ],
 [
  "h += '<p style=\"margin:6px 0 0\"><button type=\"button\" class=\"btn-primary btn-sm\" id=\"rollApplyBtn\" onclick=\"applyRoll()\">Apply roll</button> ' +",
  "h += '<p style=\"margin:6px 0 0\"><button type=\"button\" class=\"btn-primary btn-sm\" id=\"rollApplyBtn\" onclick=\"applyRoll()\">Roll\\'u uygula</button> ' +"
 ],
 [
  "h += row('Breakeven', fmtBesList(breakevensOf(legs)), fmtBesList(breakevensOf(afterLegs)));",
  "h += row('Break-Even', fmtBesList(breakevensOf(legs)), fmtBesList(breakevensOf(afterLegs)));"
 ],
 [
  "h += row('Chance of profit', fmtPop(before.pop), fmtPop(after.pop));",
  "h += row('Kâr olasılığı', fmtPop(before.pop), fmtPop(after.pop));"
 ],
 [
  "h += row('Max loss', fmtStatMoney(before.maxLoss), fmtStatMoney(after.maxLoss));",
  "h += row('Maks zarar', fmtStatMoney(before.maxLoss), fmtStatMoney(after.maxLoss));"
 ],
 [
  "h += row('Max profit', fmtStatMoney(before.maxProfit), fmtStatMoney(after.maxProfit));",
  "h += row('Maks kâr', fmtStatMoney(before.maxProfit), fmtStatMoney(after.maxProfit));"
 ],
 [
  "h += row('Net cost', fmtNet(before.net), fmtNet(after.net));",
  "h += row('Net maliyet', fmtNet(before.net), fmtNet(after.net));"
 ],
 [
  "html += '<h4>Breakeven</h4><p>' + g.breakeven + '</p>';",
  "html += '<h4>Break-Even</h4><p>' + g.breakeven + '</p>';"
 ],
 [
  "html += '<h4>Greeks profile</h4><p>' + g.greeks + '</p>';",
  "html += '<h4>Greeks profili</h4><p>' + g.greeks + '</p>';"
 ],
 [
  "html += '<h4>Key risks</h4><p>' + g.risks + '</p>';",
  "html += '<h4>Temel riskler</h4><p>' + g.risks + '</p>';"
 ],
 [
  "html += '<h4>Managing it</h4><p>' + g.manage + '</p>';",
  "html += '<h4>Yönetimi</h4><p>' + g.manage + '</p>';"
 ],
 [
  "html += '<h4>Max loss</h4><p>' + g.maxLoss + '</p>';",
  "html += '<h4>Maks zarar</h4><p>' + g.maxLoss + '</p>';"
 ],
 [
  "html += '<h4>Max profit</h4><p>' + g.maxProfit + '</p>';",
  "html += '<h4>Maks kâr</h4><p>' + g.maxProfit + '</p>';"
 ],
 [
  "ideal: 'A low-volatility grind, post-earnings calm, or a stock pinned by an absence of news.',",
  "ideal: 'Düşük volatilite, Earnings sonrası sakinlik veya haber yokluğuyla bir seviyeye sabitlenmiş hisse.',"
 ],
 [
  "ideal: 'A moderate drop to a downside target is expected; you want defined risk for less than an outright put.',",
  "ideal: 'Aşağı yönlü bir hedefe ılımlı bir düşüş bekleniyor; tek başına bir put\\'tan daha ucuza tanımlı risk istiyorsunuz.',"
 ],
 [
  "ideal: 'A moderate rise to a price target is expected; you want defined risk and a lower premium than an outright call.',",
  "ideal: 'Bir fiyat hedefine ılımlı bir yükseliş bekleniyor; tanımlı risk ve tek başına bir call\\'dan daha düşük bir premium istiyorsunuz.',"
 ],
 [
  "ideal: 'A sharp drop is expected, or as portfolio insurance — a protective put under shares you already own.',",
  "ideal: 'Sert bir düşüş bekleniyor veya portföy sigortası olarak — zaten sahip olduğunuz hisselerin altında koruyucu bir put.',"
 ],
 [
  "ideal: 'A slow bleed down to the short strike; often used to finance downside hedges cheaply.',",
  "ideal: 'Short strike\\'a doğru yavaş bir erime; genellikle düşüş hedge\\'lerini ucuza finanse etmek için kullanılır.',"
 ],
 [
  "ideal: 'A slow grind up to the short strike, with rich IV making the short calls expensive.',",
  "ideal: 'Short strike\\'a doğru yavaş bir tırmanış; yüksek IV short call\\'ları pahalı hale getirir.',"
 ],
 [
  "ideal: 'A strong upward move is expected — a breakout, product launch, or momentum run — and you want defined, limited risk.',",
  "ideal: 'Güçlü bir yukarı hareket bekleniyor — bir kırılım, ürün lansmanı veya momentum koşusu — ve tanımlı, sınırlı risk istiyorsunuz.',"
 ],
 [
  "ideal: 'Bullish but premium-sensitive; popular for hedging producers or expressing a directional tilt cheaply.',",
  "ideal: 'Bullish ama premium\\'a duyarlı; üreticilerin hedge\\'i veya ucuz yönlü eğilim için popüler.',"
 ],
 [
  "ideal: 'Earnings, FDA decisions, or breakouts where a large move is likely but the direction is a coin flip.',",
  "ideal: 'Earnings, FDA kararları veya büyük hareketin muhtemel ama yönün yazı-tura olduğu kırılımlar.',"
 ],
 [
  "ideal: 'Long-term bullish on a stock, wanting covered-call income with a fraction of the capital.',",
  "ideal: 'Bir hisseye uzun vadeli bullish, sermayenin küçük bir kısmıyla covered call geliri isteyen.',"
 ],
 [
  "ideal: 'Mildly bullish to neutral; you want premium income without any upside tail risk.',",
  "ideal: 'Hafif bullish\\'ten neutral\\'a; yukarı yön kuyruk riski olmadan premium geliri istiyorsunuz.',"
 ],
 [
  "ideal: 'Range-bound expectations with a preference for put pricing, or to balance an existing call-side position.',",
  "ideal: 'Put fiyatlamasını tercih eden bant aralığı beklentisi veya mevcut bir call tarafı pozisyonu dengelemek için.',"
 ],
 [
  "ideal: 'Range-bound stock, elevated IV (rich premiums to sell), and no binary events inside the window.',",
  "ideal: 'Bant aralığında hisse, yüksek IV (satılacak zengin premium\\'lar) ve pencerede ikili olay yok.',"
 ],
 [
  "ideal: 'Range-bound, low-volatility stocks where you want more room for error than an at-the-money straddle allows.',",
  "ideal: 'Bir at-the-money straddle\\'ın izin verdiğinden daha fazla hata payı istediğiniz, bant aralıklı düşük volatilite hisseleri.',"
 ],
 [
  "ideal: 'Same event-driven setups as a straddle, when you want to pay less premium and accept needing a larger move.',",
  "ideal: 'Daha az premium ödeyip daha büyük harekete razı olduğunuzda, bir straddle ile aynı olay odaklı kurulumlar.',"
 ],
 [
  "ideal: 'Same pinning setups as the call butterfly; often chosen when put skew makes the pricing slightly better.',",
  "ideal: 'Call butterfly ile aynı pin kurulumları; put skew fiyatlamayı biraz iyileştirdiğinde tercih edilir.',"
 ],
 [
  "ideal: 'Stock near the strike into the front expiry, with the term structure in contango (far-month IV at or above near-month IV).',",
  "ideal: 'Ön vade expiration\\'ına doğru strike yakınında hisse; vade yapısı contango\\'da (uzak ay IV\\'si yakın ay IV\\'sine eşit veya üstünde).',"
 ],
 [
  "ideal: 'Strongly bearish with limited capital, or hedging long stock without selling it.',",
  "ideal: 'Sınırlı sermayeyle güçlü bearish veya long hisseyi satmadan hedge etme.',"
 ],
 [
  "ideal: 'Strongly bullish with limited capital; often paired with a protective long put (a collar) to define risk.',",
  "ideal: 'Sınırlı sermayeyle güçlü bullish; riski tanımlamak için koruyucu bir long put (collar) ile sık eşleştirilir.',"
 ],
 [
  "ideal: 'You expect the stock to finish inside a range but want more room for error than a butterfly allows.',",
  "ideal: 'Hissenin bir aralık içinde bitirmesini bekliyorsunuz ama bir butterfly\\'nın izin verdiğinden daha fazla hata payı istiyorsunuz.',"
 ],
 [
  "ideal: 'You expect the stock to gravitate to a level and sit there — low-volatility pinning with defined risk.',",
  "ideal: 'Hissenin bir seviyeye yönelip orada oturmasını bekliyorsunuz — tanımlı riskli düşük volatilite pin\\'i.',"
 ],
 [
  "ideal: 'You expect the stock to pin a strike into expiry — classic for index options in quiet weeks.',",
  "ideal: 'Hissenin expiration\\'a bir strike\\'a sabitlenmesini bekliyorsunuz — sakin haftalarda endeks opsiyonları için klasik.',"
 ],
 [
  "ideal: 'You like the stock long term but expect it to trade flat or drift up modestly — you want yield, not a home run.',",
  "ideal: 'Hisseyi uzun vadeli seviyorsunuz ama yatay işlem görmesini veya ılımlı yükselmesini bekliyorsunuz — büyük vuruş değil, getiri istiyorsunuz.',"
 ],
 [
  "ideal: 'You want to own a stock you like at a lower price, or you expect it to stay flat/up and want income while you wait.',",
  "ideal: 'Sevdiğiniz bir hisseye daha düşük fiyattan sahip olmak istiyorsunuz veya yatay/yukarı kalmasını bekleyip beklerken gelir istiyorsunuz.',"
 ],
 [
  "if (!(d >= 0)) return 'just now';",
  "if (!(d >= 0)) return 'az önce';"
 ],
 [
  "if (!chain){ wrap.innerHTML='<div style=\"padding:14px\">Empty chain for '+exp+'</div>'; return; }",
  "if (!chain){ wrap.innerHTML='<div style=\"padding:14px\">Zincir boş: '+exp+'</div>'; return; }"
 ],
 [
  "if (!data || !data.expirations || !data.expirations.length) throw new Error('No expirations (try SPY, QQQ, AAPL)');",
  "if (!data || !data.expirations || !data.expirations.length) throw new Error('Expiration yok (SPY, QQQ, AAPL deneyin)');"
 ],
 [
  "if (!last || !isFinite(last)) throw new Error('No price');",
  "if (!last || !isFinite(last)) throw new Error('Fiyat yok');"
 ],
 [
  "if (!r2.ok) throw new Error('CBOE fetch failed '+r2.status);",
  "if (!r2.ok) throw new Error('CBOE verisi alınamadı '+r2.status);"
 ],
 [
  "if (!res || !res.meta) throw new Error('Empty quote');",
  "if (!res || !res.meta) throw new Error('Boş kotasyon');"
 ],
 [
  "if (!sym) { setQuoteStatus('Enter a Symbol (e.g. SPY, AAPL).', 'err'); return; }",
  "if (!sym) { setQuoteStatus('Bir sembol girin (örn. SPY, AAPL).', 'err'); return; }"
 ],
 [
  "if (!sym){ enterManualDataMode('', 'No ticker entered — enter Spot, Strike and Premium manually below.'); return; }",
  "if (!sym){ enterManualDataMode('', 'Sembol girilmedi — Spot, Strike ve Premium\\'u aşağıdan manuel girin.'); return; }"
 ],
 [
  "if (box) box.innerHTML = '<p class=\"disc-empty\">Enter a new strike to model the roll.</p>';",
  "if (box) box.innerHTML = '<p class=\"disc-empty\">Roll\\'u modellemek için yeni bir strike girin.</p>';"
 ],
 [
  "if (btn) btn.textContent = 'Apply roll';",
  "if (btn) btn.textContent = 'Roll\\'u uygula';"
 ],
 [
  "if (cap) cap.innerHTML = 'Click again to swap the leg. <button type=\"button\" class=\"btn-sm\" style=\"margin-left:6px\" onclick=\"disarmRoll()\">Cancel</button>';",
  "if (cap) cap.innerHTML = 'Bacağı değiştirmek için tekrar tıklayın. <button type=\"button\" class=\"btn-sm\" style=\"margin-left:6px\" onclick=\"disarmRoll()\">İptal</button>';"
 ],
 [
  "if (days < 7) return days + 'd ago';",
  "if (days < 7) return days + 'g önce';"
 ],
 [
  "if (h < 24) return h + 'h ago';",
  "if (h < 24) return h + 'sa önce';"
 ],
 [
  "if (label) label.textContent = theme === 'dark' ? 'Dark' : 'Light';",
  "if (label) label.textContent = theme === 'dark' ? 'Koyu' : 'Açık';"
 ],
 [
  "if (m < 1) return 'just now';",
  "if (m < 1) return 'az önce';"
 ],
 [
  "if (m < 60) return m + 'm ago';",
  "if (m < 60) return m + 'dk önce';"
 ],
 [
  "if (plMetric === 'cost') return 'P/L (% of entry cost)';",
  "if (plMetric === 'cost') return 'P/L (giriş maliyetinin %\\'si)';"
 ],
 [
  "if (plMetric === 'risk') return 'P/L (% of max risk)';",
  "if (plMetric === 'risk') return 'P/L (maks riskin %\\'si)';"
 ],
 [
  "if (r.modeled) h += '<p class=\"disc-note\">Modeled prices — no chain quote for one or both sides.</p>';",
  "if (r.modeled) h += '<p class=\"disc-note\">Modellenmiş fiyatlar — bir veya iki taraf için zincir kotasyonu yok.</p>';"
 ],
 [
  "if (tail > 0) maxProfitText = 'Unlimited';",
  "if (tail > 0) maxProfitText = 'Sınırsız';"
 ],
 [
  "if (tailSlope > 0) maxProfitText = 'Unlimited';",
  "if (tailSlope > 0) maxProfitText = 'Sınırsız';"
 ],
 [
  "if (titleEl) titleEl.textContent = 'Strategy guide';",
  "if (titleEl) titleEl.textContent = 'Strateji rehberi';"
 ],
 [
  "if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');",
  "if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç');"
 ],
 [
  "if (v === Infinity) return 'Unlimited';",
  "if (v === Infinity) return 'Sınırsız';"
 ],
 [
  "inp.value = s.price; inp.setAttribute('aria-label', 'Slice target price ' + (i + 1));",
  "inp.value = s.price; inp.setAttribute('aria-label', 'Dilim hedef fiyatı ' + (i + 1));"
 ],
 [
  "iron_butterfly: { title: 'Iron Butterfly', href: '/strategies/', label: 'Strategies' },",
  "iron_butterfly: { title: 'Iron Butterfly', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "iron_condor: { title: 'Iron Condor', href: '/iron-condor/', label: 'Iron Condor guide' },",
  "iron_condor: { title: 'Iron Condor', href: '/iron-condor/', label: 'Iron Condor rehberi' },"
 ],
 [
  "jade_lizard: { title: 'Jade Lizard', href: '/strategies/', label: 'Strategies' },",
  "jade_lizard: { title: 'Jade Lizard', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "label: 'B · time left' + fbB,",
  "label: 'B · kalan süre' + fbB,"
 ],
 [
  "label: (compareMode ? 'A · time left' : 'Theoretical (time left)') + fbA,",
  "label: (compareMode ? 'A · kalan süre' : 'Teorik (kalan süre)') + fbA,"
 ],
 [
  "let h = '<table class=\"pl-table\"><thead><tr><th style=\"text-align:left\">Structure</th><th>Cost</th><th>P/L @ ' + formatMoney(target) + '</th><th>POP</th><th>Max loss</th><th></th></tr></thead><tbody>';",
  "let h = '<table class=\"pl-table\"><thead><tr><th style=\"text-align:left\">Yapı</th><th>Maliyet</th><th>P/L @ ' + formatMoney(target) + '</th><th>POP</th><th>Maks zarar</th><th></th></tr></thead><tbody>';"
 ],
 [
  "let h = '<table class=\"pl-table\"><thead><tr><th style=\"text-align:left\">Structure</th><th>Net</th><th>Max profit</th><th>Max loss</th><th>ROC</th><th>POP</th><th></th></tr></thead><tbody>';",
  "let h = '<table class=\"pl-table\"><thead><tr><th style=\"text-align:left\">Yapı</th><th>Net</th><th>Maks kâr</th><th>Maks zarar</th><th>ROC</th><th>POP</th><th></th></tr></thead><tbody>';"
 ],
 [
  "let html = '<thead><tr><th>Price</th>';",
  "let html = '<thead><tr><th>Fiyat</th>';"
 ],
 [
  "long_call: { title: 'Long Call', href: '/level2/', label: 'Fundamentals' },",
  "long_call: { title: 'Long Call', href: '/level2/', label: 'Temeller' },"
 ],
 [
  "long_call_butterfly: { title: 'Call Butterfly', href: '/strategies/', label: 'Strategies' },",
  "long_call_butterfly: { title: 'Call Butterfly', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "long_put: { title: 'Long Put', href: '/level2/', label: 'Fundamentals' },",
  "long_put: { title: 'Long Put', href: '/level2/', label: 'Temeller' },"
 ],
 [
  "long_put_butterfly: { title: 'Put Butterfly', href: '/strategies/', label: 'Strategies' },",
  "long_put_butterfly: { title: 'Put Butterfly', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "long_straddle: { title: 'Long Straddle', href: '/strategies/', label: 'Strategies' },",
  "long_straddle: { title: 'Long Straddle', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "long_strangle: { title: 'Long Strangle', href: '/strategies/', label: 'Strategies' },",
  "long_strangle: { title: 'Long Strangle', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "manage: 'Close or roll before front expiry to dodge pin and gamma risk. Do not hold the leftover long call naked by accident.',",
  "manage: 'Pin ve gamma riskinden kaçınmak için ön vade expiration\\'ından önce kapatın veya roll edin. Kalan long call\\'i yanlışlıkla çıplak tutmayın.',"
 ],
 [
  "manage: 'Exit after the event: post-news IV crush hits long premium hard. Consider selling into the initial spike.',",
  "manage: 'Olaydan sonra çıkın: haber sonrası IV crush long premium\\'u sert vurur. İlk sıçramada satmayı düşünün.',"
 ],
 [
  "manage: 'If the stock drops toward the strike, roll the put down and out to avoid assignment — or accept the shares at your target price.',",
  "manage: 'Hisse strike\\'a doğru düşerse, assignment\\'dan kaçınmak için put\\'u aşağı ve ileriye roll edin — veya hisseleri hedef fiyatınızdan kabul edin.',"
 ],
 [
  "manage: 'If the stock drops, the short put goes in the money — roll it down or close before assignment. Bank call profits on spikes.',",
  "manage: 'Hisse düşerse short put in-the-money olur — assignment\\'dan önce aşağı roll edin veya kapatın. Sıçramalarda call kârlarını cebe indirin.',"
 ],
 [
  "manage: 'If the stock surges past the strike, roll the call up and out to keep some upside. If assigned, you simply sell your shares at the strike.',",
  "manage: 'Hisse strike\\'ın üstüne fırlarsa, bir miktar yukarı yönü korumak için call\\'u yukarı ve ileriye roll edin. Assignment olursa hisselerinizi strike\\'tan satarsınız.',"
 ],
 [
  "manage: 'Manage it like a stock position. Add a long put wing to define risk, turning it into a risk reversal or collar.',",
  "manage: 'Bir hisse pozisyonu gibi yönetin. Riski tanımlamak için bir long put kanadı ekleyin; bunu bir risk reversal veya collar\\'a dönüştürür.',"
 ],
 [
  "manage: 'Manage like a short stock position; add a long call wing to cap the upside risk.',",
  "manage: 'Bir short hisse pozisyonu gibi yönetin; yukarı yön riskini sınırlamak için bir long call kanadı ekleyin.',"
 ],
 [
  "manage: 'Often best traded into the event and out right after: IV crush after the news can erase gains even if the stock moves.',",
  "manage: 'Genellikle olaya girerken alınıp hemen sonrasında çıkılır: haber sonrası IV crush, hisse hareket etse bile kazançları silebilir.',"
 ],
 [
  "manage: 'On a rally, roll the short call up to keep collecting. On a drop, defend the put spread like any short put spread.',",
  "manage: 'Bir rallide toplamaya devam etmek için short call\\'u yukarı roll edin. Bir düşüşte put spread\\'i her short put spread gibi savunun.',"
 ],
 [
  "manage: 'Puts can gain value fast in a selloff. Take profits on spikes rather than holding out for zero.',",
  "manage: 'Put\\'lar bir satış dalgasında hızla değer kazanabilir. Sıfırı beklemek yerine sıçramalarda kâr alın.',"
 ],
 [
  "manage: 'Roll the short call up and out on rallies. Give the LEAPS 12+ months so short-term decay barely touches it.',",
  "manage: 'Rallilerde short call\\'u yukarı ve ileriye roll edin. Kısa vadeli erime neredeyse dokunmasın diye LEAPS\\'e 12+ ay verin.',"
 ],
 [
  "manage: 'Same as the call butterfly: sell into the fill, do not overpay for time.',",
  "manage: 'Call butterfly ile aynı: doluma doğru satın, zamana fazla ödemeyin.',"
 ],
 [
  "manage: 'Scale out as the body fills; avoid holding into expiry hoping for the last few dollars.',",
  "manage: 'Gövde doldukça kademeli çıkın; son birkaç dolar umuduyla expiration\\'a kadar tutmayın.',"
 ],
 [
  "manage: 'Scale out as the body fills; time decay eats condors into expiry, so earlier exits usually beat hoping for max.',",
  "manage: 'Gövde doldukça kademeli çıkın; zaman erimesi condor\\'ları expiration\\'a doğru yer, erken çıkışlar maks umudunu genellikle yener.',"
 ],
 [
  "manage: 'Sell into strength as the body fills in; butterflies decay into expiry, so avoid paying up with days left.',",
  "manage: 'Gövde doldukça güçlenmede satın; butterfly\\'lar expiration\\'a doğru erir, günler kala fazla ödemeyin.',"
 ],
 [
  "manage: 'Take profit around 50% of max credit. If a short strike is tested, roll the untested side toward it or close for a small loss.',",
  "manage: 'Maks credit\\'in ~%50\\'sinde kâr alın. Bir short strike test edilirse test edilmeyen tarafı ona doğru roll edin veya küçük zararla kapatın.',"
 ],
 [
  "manage: 'Take profit as the spread approaches max value near expiry. Do not let a winner turn: pin risk is real if the stock sits near the short strike at expiry.',",
  "manage: 'Spread expiration yakınında maks değere yaklaşırken kâr alın. Kazananı kayba döndürmeyin: hisse expiration\\'da short strike yakınındaysa pin riski gerçektir.',"
 ],
 [
  "manage: 'Take profit as the spread approaches max value. Close before expiry to avoid pin risk near the short strike.',",
  "manage: 'Spread maks değere yaklaşırken kâr alın. Short strike yakınındaki pin riskinden kaçınmak için expiration\\'dan önce kapatın.',"
 ],
 [
  "manage: 'Take profit at ~50% of max. If a strike is tested, roll the untested side toward it or close the position.',",
  "manage: 'Maks değerin ~%50\\'sinde kâr alın. Bir strike test edilirse test edilmeyen tarafı ona doğru roll edin veya pozisyonu kapatın.',"
 ],
 [
  "manage: 'Take profit near the short strike. Close or roll well before a crash can run past the lower breakeven.',",
  "manage: 'Short strike yakınında kâr alın. Bir çöküş alt break-even\\'i aşmadan çok önce kapatın veya roll edin.',"
 ],
 [
  "manage: 'Take profit near the short strike. Never hold the naked upper tail into a melt-up — close or roll the risk off.',",
  "manage: 'Short strike yakınında kâr alın. Çıplak üst kuyruğu bir erime-yükselişine asla taşımayın — riski kapatın veya roll edin.',"
 ],
 [
  "manage: 'Take profits at 25–50% of maximum. Defend or close if the stock starts trending — short gamma means losses accelerate.',",
  "manage: 'Maksimumun %25–50\\'sinde kâr alın. Hisse trend yapmaya başlarsa savunun veya kapatın — short gamma, zararların hızlandığı anlamına gelir.',"
 ],
 [
  "manage: 'Take profits into strength. Time decay accelerates in the final 30 days, so avoid holding short-dated calls into expiry week unless the move is already happening.',",
  "manage: 'Güçlenmede kâr alın. Zaman erimesi son 30 günde hızlanır; hareket zaten olmuyorsa kısa vadeli call\\'ları expiration haftasına taşımayın.',"
 ],
 [
  "maxLoss: 'Both premiums, if the stock finishes between the strikes.',",
  "maxLoss: 'Hisse strike\\'lar arasında bitirirse iki premium da sizin.',"
 ],
 [
  "maxLoss: 'Both premiums, if the stock pins the strike at expiry.',",
  "maxLoss: 'Hisse expiration\\'da strike\\'a sabitlenirse iki premium da sizin.',"
 ],
 [
  "maxLoss: 'Large: put strike − premium if the stock collapses.',",
  "maxLoss: 'Büyük: hisse çökerse put strike − premium.',"
 ],
 [
  "maxLoss: 'Spread width − net credit.',",
  "maxLoss: 'Spread genişliği − net Credit.',"
 ],
 [
  "maxLoss: 'Substantial: the stock can fall to zero; the premium only slightly offsets. Same downside as owning the stock outright.',",
  "maxLoss: 'Önemli: hisse sıfıra inebilir; premium ancak hafif dengeler. Tek başına hisseye sahip olmakla aynı aşağı yön.',"
 ],
 [
  "maxLoss: 'The net debit if the stock collapses — the LEAPS can lose most of its value.',",
  "maxLoss: 'Hisse çökerse net debit — LEAPS değerinin çoğunu kaybedebilir.',"
 ],
 [
  "maxLoss: 'The net debit paid.',",
  "maxLoss: 'Ödenen net Debit.',"
 ],
 [
  "maxLoss: 'The net debit, if the stock moves far away in either direction.',",
  "maxLoss: 'Hisse her iki yönde de uzağa giderse net debit.',"
 ],
 [
  "maxLoss: 'The premium you paid, if the stock finishes above the strike.',",
  "maxLoss: 'Hisse strike üstünde bitirirse ödediğiniz premium.',"
 ],
 [
  "maxLoss: 'The premium you paid, if the stock finishes below the strike.',",
  "maxLoss: 'Hisse strike altında bitirirse ödediğiniz premium.',"
 ],
 [
  "maxLoss: 'Unlimited above the upper breakeven — beyond it you are naked short a call.',",
  "maxLoss: 'Üst break-even\\'in üstünde sınırsız — ötesinde çıplak short bir call\\'sunuz.',"
 ],
 [
  "maxLoss: 'Unlimited to the upside; large to the downside.',",
  "maxLoss: 'Yukarı yönde sınırsız; aşağı yönde büyük.',"
 ],
 [
  "maxLoss: 'Unlimited — like a short stock position into a rally.',",
  "maxLoss: 'Sınırsız — bir rallide short hisse pozisyonu gibi.',"
 ],
 [
  "maxLoss: 'Wing width − net credit.',",
  "maxLoss: 'Kanat genişliği − net Credit.',"
 ],
 [
  "maxProfit: 'Large but capped: nearly the strike price if the stock went to zero, minus the premium.',",
  "maxProfit: 'Büyük ama sınırlı: hisse sıfıra inerse neredeyse strike fiyatı, eksi premium.',"
 ],
 [
  "maxProfit: 'Large: nearly the strike if the stock went to zero.',",
  "maxProfit: 'Büyük: hisse sıfıra inerse neredeyse strike.',"
 ],
 [
  "maxProfit: 'Near the strike at front expiry: the short call dies worthless while the long call retains time value.',",
  "maxProfit: 'Ön vade expiration\\'ında strike yakınında: short call değersiz ölürken long call zaman değerini korur.',"
 ],
 [
  "maxProfit: 'The net credit received (stock pins the short strikes).',",
  "maxProfit: 'Alınan net credit (hisse short strike\\'lara sabitlenir).',"
 ],
 [
  "maxProfit: 'The net credit received.',",
  "maxProfit: 'Alınan net Credit.',"
 ],
 [
  "maxProfit: 'The premium received, if the stock stays above the strike.',",
  "maxProfit: 'Hisse strike üstünde kalırsa alınan premium.',"
 ],
 [
  "maxProfit: 'The total credit received.',",
  "maxProfit: 'Alınan toplam Credit.',"
 ],
 [
  "maxProfit: 'The total premium received, if the stock pins the strike.',",
  "maxProfit: 'Hisse strike\\'a sabitlenirse alınan toplam premium.',"
 ],
 [
  "maxProfit: 'The total premium received.',",
  "maxProfit: 'Alınan toplam Premium.',"
 ],
 [
  "maxProfit: 'Unlimited on the call side.',",
  "maxProfit: 'Call tarafında sınırsız.',"
 ],
 [
  "maxProfit: 'Unlimited to the upside; large to the downside (stock to zero) — minus the two premiums.',",
  "maxProfit: 'Yukarı yönde sınırsız; aşağı yönde büyük (hisse sıfıra inerse) — eksi iki Premium.',"
 ],
 [
  "maxProfit: 'Unlimited up; large down — minus the two premiums.',",
  "maxProfit: 'Yukarı yönde sınırsız; aşağı yönde büyük — eksi iki Premium.',"
 ],
 [
  "maxProfit: 'Unlimited.',",
  "maxProfit: 'Sınırsız.',"
 ],
 [
  "maxProfit: 'Unlimited: the higher the stock climbs, the more the call is worth.',",
  "maxProfit: 'Sınırsız: hisse ne kadar yükselirse call o kadar değerli.',"
 ],
 [
  "maxProfit: 'Width between the inner strikes − net debit.',",
  "maxProfit: 'İç strike\\'lar arası genişlik − net debit.',"
 ],
 [
  "maxProfit: 'Width between the strikes − net debit paid.',",
  "maxProfit: 'Strike\\'lar arası genişlik − ödenen net debit.',"
 ],
 [
  "opts = '<option value=\"' + cur + '\" selected>Custom (' + cur + 'd)</option>' + opts;",
  "opts = '<option value=\"' + cur + '\" selected>Özel (' + cur + 'd)</option>' + opts;"
 ],
 [
  "outlook: 'Bullish (capital-efficient)',",
  "outlook: 'Bullish (sermaye verimli)',"
 ],
 [
  "outlook: 'Bullish tilt',",
  "outlook: 'Bullish eğilim',"
 ],
 [
  "outlook: 'Bullish to neutral',",
  "outlook: 'Bullish\\'ten Neutral\\'a',"
 ],
 [
  "outlook: 'Moderately bearish',",
  "outlook: 'Orta derecede Bearish',"
 ],
 [
  "outlook: 'Moderately bullish',",
  "outlook: 'Orta derecede Bullish',"
 ],
 [
  "outlook: 'Neutral to mildly bearish',",
  "outlook: 'Neutral\\'dan hafif Bearish\\'e',"
 ],
 [
  "outlook: 'Neutral to mildly bullish',",
  "outlook: 'Neutral\\'dan hafif Bullish\\'e',"
 ],
 [
  "outlook: 'Neutral — low volatility',",
  "outlook: 'Neutral — düşük volatilite',"
 ],
 [
  "outlook: 'Neutral — pinned at the middle strike',",
  "outlook: 'Neutral — orta strike\\'a sabitlenmiş',"
 ],
 [
  "outlook: 'Neutral — pinned at the strike',",
  "outlook: 'Neutral — Strike\\'a sabitlenmiş',"
 ],
 [
  "outlook: 'Neutral — range-bound',",
  "outlook: 'Neutral — bant aralığında',"
 ],
 [
  "outlook: 'Neutral — settle in a zone',",
  "outlook: 'Neutral — bir bölgede uzlaşma',"
 ],
 [
  "outlook: 'Neutral — time decay harvest',",
  "outlook: 'Neutral — zaman erimesi hasadı',"
 ],
 [
  "outlook: 'Volatile — direction unknown',",
  "outlook: 'Volatil — yön bilinmiyor',"
 ],
 [
  "put_condor: { title: 'Put Condor', href: '/strategies/', label: 'Strategies' },",
  "put_condor: { title: 'Put Condor', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "return '<input type=\"text\" value=\"—\" disabled title=\"Not used for stock\" style=\"opacity:0.45;cursor:not-allowed;\" />';",
  "return '<input type=\"text\" value=\"—\" disabled title=\"Hisse için kullanılmaz\" style=\"opacity:0.45;cursor:not-allowed;\" />';"
 ],
 [
  "return '<select title=\"Expiration date (from chain)\" onchange=\"updateLegField(' + l.id + ',\\'dte\\',this.value,false)\">' + opts + '</select>';",
  "return '<select title=\"Expiration tarihi (zincirden)\" onchange=\"updateLegField(' + l.id + ',\\'dte\\',this.value,false)\">' + opts + '</select>';"
 ],
 [
  "return 'Custom (' + list.length + ' legs)';",
  "return 'Özel (' + list.length + ' bacak)';"
 ],
 [
  "return 'Custom (2 legs)';",
  "return 'Özel (2 bacak)';"
 ],
 [
  "return 'Empty';",
  "return 'Boş';"
 ],
 [
  "return (l.side === 'buy' ? 'Buy ' : 'Sell ') + l.type + ' ' + l.strike + ' (' + l.dte + 'd)';",
  "return (l.side === 'buy' ? 'Al ' : 'Sat ') + l.type + ' ' + l.strike + ' (' + l.dte + 'd)';"
 ],
 [
  "return document.documentElement.lang === 'tr' ? '— Şablon seçin —' : '— Pick a Strategy —';",
  "return document.documentElement.lang === 'tr' ? '— Strateji seçin —' : '— Pick a Strategy —';"
 ],
 [
  "return { amount: Math.max(0, initialCost(legs)), basis: 'cash — full debit' };",
  "return { amount: Math.max(0, initialCost(legs)), basis: 'nakit — tam Debit' };"
 ],
 [
  "return { amount: definedRiskMaxLoss(legs), basis: 'max loss (defined risk)' };",
  "return { amount: definedRiskMaxLoss(legs), basis: 'maks zarar (tanımlı risk)' };"
 ],
 [
  "return { amount: m, basis: 'Reg-T naked-short estimate' };",
  "return { amount: m, basis: 'Reg-T çıplak Short tahmini' };"
 ],
 [
  "rh > 5 ? 'Rates help: +1% rates adds about $' + Math.abs(rh).toFixed(0) + '.'",
  "rh > 5 ? 'Faizler lehinize: faizler +1% olursa yaklaşık $' + Math.abs(rh).toFixed(0) + ' kazandırır.'"
 ],
 [
  "risks: 'A sharp move either way flattens the edge; an IV crush hurts the long back-month option more than the short front one.'",
  "risks: 'Her iki yöne sert bir hareket avantajı eritir; bir IV crush, long arka ay opsiyonu, short ön ay opsiyonundan daha çok yaralar.'"
 ],
 [
  "risks: 'Capped downside profit, and both legs expire worthless if the stock does not fall.'",
  "risks: 'Aşağı yönlü kâr sınırlı; hisse düşmezse iki bacak da değersiz sona erer.'"
 ],
 [
  "risks: 'Capped upside — you will miss rallies above the strike. You keep the full downside risk of stock ownership.'",
  "risks: 'Yukarı yön sınırlı — strike üstü rallileri kaçırırsınız. Hisse sahipliğinin tüm aşağı yön riskini taşırsınız.'"
 ],
 [
  "risks: 'Capped upside, and both legs can expire worthless if the stock does not rise. Wide bid/ask on the short leg can hurt fills.'",
  "risks: 'Yukarı yön sınırlı; hisse yükselmezse iki bacak da değersiz bitebilir. Short bacakta geniş bid/ask gerçekleşmeleri zora sokabilir.'"
 ],
 [
  "risks: 'Concentrated risk at one strike: a move in either direction toward a wing can produce the max loss fast.'",
  "risks: 'Tek strike\\'ta yoğunlaşmış risk: bir kanada doğru her iki yönde hareket maks zararı hızla doğurabilir.'"
 ],
 [
  "risks: 'Narrow profit zone and time decay — most expire well below max profit.'",
  "risks: 'Dar kâr bölgesi ve zaman erimesi — çoğu maks kârın çok altında sona erer.'"
 ],
 [
  "risks: 'Narrow profit zone: the stock must land close to the middle strike. Most butterflies expire for a fraction of max.'",
  "risks: 'Dar kâr bölgesi: hisse orta strike\\'a yakın inmeli. Çoğu butterfly, maks değerin küçük bir kısmıyla sona erer.'"
 ],
 [
  "risks: 'Nearly unlimited downside risk past the lower breakeven. Manage actively — this spread punishes complacency.'",
  "risks: 'Alt break-even\\'in ötesinde neredeyse sınırsız aşağı yön riski. Aktif yönetin — bu spread rehaveti cezalandırır.'"
 ],
 [
  "risks: 'Needs an even bigger move than a straddle to overcome two premiums. Slow melts and pins are the worst outcome.'",
  "risks: 'İki premium\\'u aşmak için bir straddle\\'dan bile büyük hareket gerekir. Yavaş erimeler ve pin\\'ler en kötü sonuçtur.'"
 ],
 [
  "risks: 'Outside the wings the full debit is lost; four legs mean fills and commissions matter.'",
  "risks: 'Kanatların dışında tam debit kaybedilir; dört bacak, gerçekleşmelerin ve komisyonların önemli olduğu anlamına gelir.'"
 ],
 [
  "risks: 'Same downside as owning the stock. The short put can be assigned if it goes deep in the money.'",
  "risks: 'Hisseye sahip olmakla aynı aşağı yön. Short put derinden in-the-money olursa assignment olabilir.'"
 ],
 [
  "risks: 'Still a narrow-range bet: outside the wings the whole debit is lost. Commissions on four legs add up.'",
  "risks: 'Hâlâ dar aralık bahsi: kanatların dışında tüm debit kaybedilir. Dört bacakta komisyonlar birikir.'"
 ],
 [
  "risks: 'Still large downside if the stock tanks. Assignment on the short call can leave an awkward spread to unwind.'",
  "risks: 'Hisse çakılırsa aşağı yön hâlâ büyük. Short call\\'da assignment, çözmesi garip bir spread bırakabilir.'"
 ],
 [
  "risks: 'The downside is the full put-spread width: a hard selloff through the long put still produces the max loss.'",
  "risks: 'Aşağı yön, tam put-spread genişliğidir: long put\\'un ötesine sert bir satış yine de maks zararı doğurur.'"
 ],
 [
  "risks: 'The loss is several multiples of the credit. High win rate, low payout: one breach can erase many winners. Size accordingly.'",
  "risks: 'Zarar, credit\\'in birkaç katıdır. Yüksek kazanma oranı, düşük ödeme: tek bir ihlal birçok kazananı silebilir. Boyutu buna göre ayarlayın.'"
 ],
 [
  "risks: 'The “cheap” call is paid for with real downside obligation. Skew can make the short put expensive to buy back in a selloff.'",
  "risks: '“Ucuz” call, gerçek bir aşağı yön yükümlülüğüyle ödenir. Skew, short put\\'u bir satış dalgasında geri almayı pahalı hale getirebilir.'"
 ],
 [
  "risks: 'Time decay and IV crush: if the stock goes nowhere, the option melts. Never pay more premium than you can afford to lose outright.'",
  "risks: 'Zaman erimesi ve IV crush: hisse hiçbir yere gitmezse opsiyon erir. Kaybetmeyi göze alabileceğinizden fazla premium ödemeyin.'"
 ],
 [
  "risks: 'Time decay: a slow grind down may not outpace daily theta. IV crush after the feared event passes can erase gains.'",
  "risks: 'Zaman erimesi: yavaş bir düşüş günlük theta\\'yı geçemeyebilir. Korkulan olay geçtikten sonra IV crush kazançları silebilir.'"
 ],
 [
  "risks: 'Undefined risk with less premium cushion than it feels like. Trending markets are the enemy — have an exit plan before entry.'",
  "risks: 'Hissedilenden az premium yastıklı tanımsız risk. Trend piyasalar düşmandır — girişten önce çıkış planınız olsun.'"
 ],
 [
  "risks: 'Undefined risk. A gap through a breakeven can lose multiples of the premium collected. Never hold through binary events.'",
  "risks: 'Tanımsız risk. Bir break-even\\'in ötesine boşluk, toplanan premium\\'un katlarını kaybettirebilir. İkili olaylara asla taşımayın.'"
 ],
 [
  "risks: 'Unlimited upside loss, and the short call can be assigned. Define the risk with a wing unless you can truly manage short exposure.'",
  "risks: 'Sınırsız yukarı yön zararı ve short call assignment olabilir. Short pozisyonu gerçekten yönetemiyorsanız riski bir kanatla tanımlayın.'"
 ],
 [
  "risks: 'Unlimited upside risk past the upper breakeven. This is not a beginner spread: it needs active management.'",
  "risks: 'Üst break-even\\'in ötesinde sınırsız yukarı yön riski. Bu yeni başlayan spread\\'i değil: aktif yönetim ister.'"
 ],
 [
  "risks: 'You can be forced to buy a falling stock. This is not free income: only sell puts on stocks you are happy to own.'",
  "risks: 'Düşen bir hisseyi almaya zorlanabilirsiniz. Bu bedava gelir değil: sadece sahip olmaktan mutlu olacağınız hisselerde put satın.'"
 ],
 [
  "risks: 'You pay two premiums and bleed theta every day. The move must beat what the market already priced in.'",
  "risks: 'İki premium ödersiniz ve her gün theta kaybedersiniz. Hareket, piyasanın zaten fiyatladığını geçmeli.'"
 ],
 [
  "setQuoteStatus('Quote failed (' + (e && e.message ? e.message : e) + '). Enter Spot manually.', 'err');",
  "setQuoteStatus('Kotasyon alınamadı (' + (e && e.message ? e.message : e) + '). Spot\\'u manuel girin.', 'err');"
 ],
 [
  "short_straddle: { title: 'Short Straddle', href: '/strategies/', label: 'Strategies' },",
  "short_straddle: { title: 'Short Straddle', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "short_strangle: { title: 'Short Strangle', href: '/strategies/', label: 'Strategies' },",
  "short_strangle: { title: 'Short Strangle', href: '/strategies/', label: 'Stratejiler' },"
 ],
 [
  "source: 'Yahoo Finance (delayed)'",
  "source: 'Yahoo Finance (gecikmeli)'"
 ],
 [
  "th < -5 ? 'Time against you: about $' + Math.abs(th).toFixed(0) + ' of Theta decay expected.'",
  "th < -5 ? 'Zaman aleyhinize: yaklaşık $' + Math.abs(th).toFixed(0) + ' Theta erimesi bekleniyor.'"
 ],
 [
  "thesis: 'A capital-efficient covered call: a deep in-the-money LEAPS call stands in for the shares, and you sell short-dated calls against it for income.',",
  "thesis: 'Sermaye verimli bir covered call: derin in-the-money bir LEAPS call hisselerin yerine geçer ve gelir için karşılığında kısa vadeli call\\'lar satarsınız.',"
 ],
 [
  "thesis: 'A cheaper way to bet on a decline: the long put gains as the stock falls, while the lower short put you sold cuts both the cost and the maximum profit.',",
  "thesis: 'Düşüşe oynamanın daha ucuz bir yolu: long put, hisse düştükçe kazanır; sattığınız daha düşük short put ise hem maliyeti hem de maksimum kârı düşürür.',"
 ],
 [
  "thesis: 'A cheaper way to bet on a rally: the long call gains as the stock rises, while the higher short call you sold cuts both the cost and the maximum profit.',",
  "thesis: 'Yükselişe oynamanın daha ucuz bir yolu: long call, hisse yükseldikçe kazanır; sattığınız daha yüksek short call ise hem maliyeti hem de maksimum kârı düşürür.',"
 ],
 [
  "thesis: 'A defined-risk bet the stock stays in a range: you sell an out-of-the-money call spread and an out-of-the-money put spread, keeping the net credit.',",
  "thesis: 'Hissenin bir aralıkta kalacağına dair tanımlı riskli bir bahis: out-of-the-money bir call spread ve out-of-the-money bir put spread satar, net credit\\'i alırsınız.',"
 ],
 [
  "thesis: 'A wider butterfly built from calls: buy a lower call, sell two middle strikes, buy an upper call. A wider landing zone for the stock.',",
  "thesis: 'Call\\'lardan kurulan daha geniş bir butterfly: düşük bir call al, iki orta strike sat, yüksek bir call al. Hisse için daha geniş bir iniş bölgesi.',"
 ],
 [
  "thesis: 'Buy a call and sell a put at the same strike: replicates owning 100 shares — the call captures upside, the put obligates the downside — for a fraction of the capital.',",
  "thesis: 'Aynı strike\\'ta bir call alıp bir put satın: 100 hisseye sahip olmayı taklit eder — call yukarı yönü yakalar, put aşağı yönü yükümlendirir — sermayenin küçük bir kısmıyla.',"
 ],
 [
  "thesis: 'Buy a put and sell a call at the same strike: replicates shorting 100 shares — the put captures downside, the call obligates the upside.',",
  "thesis: 'Aynı strike\\'ta bir put alıp bir call satın: 100 hisse short\\'lamayı taklit eder — put aşağı yönü yakalar, call yukarı yönü yükümlendirir.',"
 ],
 [
  "thesis: 'Buy one lower call, sell two middle calls, buy one higher call: a low-cost bet the stock lands near the middle strike at expiry.',",
  "thesis: 'Bir düşük call al, iki orta call sat, bir yüksek call al: hissenin expiration\\'da orta strike yakınlarına ineceğine dair düşük maliyetli bir bahis.',"
 ],
 [
  "thesis: 'Like a straddle but with out-of-the-money strikes: cheaper to enter, but the stock must move further to profit.',",
  "thesis: 'Bir straddle gibi ama out-of-the-money strike\\'larla: giriş daha ucuz, ama kâr için hissenin daha fazla hareket etmesi gerekir.',"
 ],
 [
  "thesis: 'Sell a near-dated call and buy a longer-dated call at the same strike: the front option decays faster, and you keep the difference.',",
  "thesis: 'Yakın vadeli bir call satıp aynı strike\\'ta daha uzun vadeli bir call alın: ön opsiyon daha hızlı erir, fark sizde kalır.',"
 ],
 [
  "thesis: 'Sell an out-of-the-money put and buy an out-of-the-money call: selling the put finances the call, giving bullish exposure at little or no premium.',",
  "thesis: 'Bir out-of-the-money put satıp bir out-of-the-money call alın: put satışı call\\'u finanse eder, az veya sıfır premium ile bullish pozisyon verir.',"
 ],
 [
  "thesis: 'The put-side mirror of the call butterfly: buy one higher put, sell two middle puts, buy one lower put. Profits if the stock pins the middle strike.',",
  "thesis: 'Call butterfly\\'nin put tarafı aynası: bir yüksek put al, iki orta put sat, bir düşük put al. Hisse orta strike\\'a sabitlenirse kâr.',"
 ],
 [
  "thesis: 'The put-side mirror of the call condor: a four-leg range bet with a wider landing zone than a butterfly.',",
  "thesis: 'Call condor\\'un put tarafı aynası: bir butterfly\\'dan daha geniş iniş bölgeli dört bacaklı aralık bahsi.',"
 ],
 [
  "thesis: 'You buy a call and a put at the same strike. You do not care which way the stock moves — you just need a BIG move.',",
  "thesis: 'Aynı strike\\'ta bir call ve bir put alırsınız. Hissenin hangi yöne gittiği umurunuzda değil — sadece BÜYÜK bir harekete ihtiyacınız var.',"
 ],
 [
  "thesis: 'You own 100 shares and sell someone else the right to buy them from you at the strike. You keep the premium as income on stock you would hold anyway.',",
  "thesis: '100 hisseniz var ve başkasına onları strike\\'tan sizden alma hakkını satıyorsunuz. Premium\\'u, zaten tutacağınız hisseden gelir olarak alırsınız.',"
 ],
 [
  "thesis: 'You pay a premium for the right to buy the stock at the strike price. You profit if the stock rallies enough to cover what you paid.',",
  "thesis: 'Hisseyi strike fiyatından alma hakkı için bir premium ödersiniz. Hisse, ödediğinizi karşılayacak kadar yükselirse kâr edersiniz.',"
 ],
 [
  "thesis: 'You pay a premium for the right to sell the stock at the strike price. You profit if the stock falls enough to cover what you paid.',",
  "thesis: 'Hisseyi strike fiyatından satma hakkı için bir premium ödersiniz. Hisse, ödediğinizi karşılayacak kadar düşerse kâr edersiniz.',"
 ],
 [
  "thesis: 'You sell a call and a put at the same strike and collect two premiums, betting the stock stays near the strike. Time decay is your profit engine.',",
  "thesis: 'Aynı strike\\'ta bir call ve bir put satıp iki premium toplarsınız; hisse strike yakınında kalır diye bahse girersiniz. Zaman erimesi kâr motorunuzdur.',"
 ],
 [
  "thesis: 'You sell a put and keep the premium. If assigned, you buy the stock at the strike — the premium effectively discounts your entry price.',",
  "thesis: 'Bir put satar ve premium\\'u alırsınız. Assignment olursa hisseyi strike\\'tan alırsınız — premium giriş fiyatınızı etkin şekilde iskontolar.',"
 ],
 [
  "thesis: 'You sell an at-the-money straddle and buy out-of-the-money wings for protection: maximum premium collection with defined risk.',",
  "thesis: 'Bir at-the-money straddle satıp korunma için out-of-the-money kanatlar alırsınız: tanımlı riskle maksimum premium toplama.',"
 ],
 [
  "thesis: 'You sell an out-of-the-money call and put, collecting premium for a bet the stock stays between the strikes. A wider profit range than a short straddle.',",
  "thesis: 'Bir out-of-the-money call ve put satıp hissenin strike\\'lar arasında kalacağına dair bahisle premium toplarsınız. Bir short straddle\\'dan daha geniş kâr aralığı.',"
 ],
 [
  "throw lastErr || new Error('Quote failed');",
  "throw lastErr || new Error('Kotasyon alınamadı');"
 ],
 [
  "tip.innerHTML = '<strong>Long option:</strong> You pay a Debit. Solid line = Expiry Payoff. Dotted line still has time value. Step days to watch Theta.';",
  "tip.innerHTML = '<strong>Long opsiyon:</strong> Bir Debit ödersiniz. Düz çizgi = Expiry Payoff. Noktalı çizgide hâlâ zaman değeri var. Theta\\'yı izlemek için günleri ilerletin.';"
 ],
 [
  "tip.innerHTML = '<strong>Multi-leg:</strong> Net Debit/Credit is above. Edit any field live — the chart updates. Use a template for a ready structure.';",
  "tip.innerHTML = '<strong>Çok bacaklı:</strong> Net Debit/Credit yukarıda. Her alanı canlı düzenleyin — grafik güncellenir. Hazır bir yapı için şablon kullanın.';"
 ],
 [
  "tip.innerHTML = '<strong>Short option:</strong> You collect a Credit. Theta helps if Underlying stays near the Strike.';",
  "tip.innerHTML = '<strong>Short opsiyon:</strong> Bir Credit alırsınız. Underlying Strike yakınında kalırsa Theta lehinize işler.';"
 ],
 [
  "tip.innerHTML = '<strong>Stock + option:</strong> Stock qty = shares, cost = entry price. Listed option qty = contracts (×100); futures options use the contract multiplier. For a Covered Call use 100 shares + 1 Short Call. <a href=\"/level2/\">Fundamentals lesson</a>';",
  "tip.innerHTML = '<strong>Stock + opsiyon:</strong> Stock adet = hisse sayısı, cost = giriş fiyatı. Listelenmiş opsiyon adedi = kontrat (×100); vadeli opsiyonlar kontrat çarpanını kullanır. Covered Call için 100 hisse + 1 Short Call kullanın. <a href=\"/level2/\">Temeller dersi</a>';"
 ],
 [
  "tip.innerHTML = '<strong>Stock leg:</strong> Qty = shares, cost = entry price. Strike and DTE are unused. Add 1 Short Call for a Covered Call.';",
  "tip.innerHTML = '<strong>Stock bacağı:</strong> Adet = hisse sayısı, cost = giriş fiyatı. Strike ve DTE kullanılmaz. Covered Call için 1 Short Call ekleyin.';"
 ],
 [
  "tip.innerHTML = 'Edit the legs or pick a strategy template. The chart is live.';",
  "tip.innerHTML = 'Bacakları düzenleyin veya bir strateji şablonu seçin. Grafik canlı.';"
 ],
 [
  "tip.textContent = 'Pick a template or edit the legs. The chart updates live.';",
  "tip.textContent = 'Bir şablon seçin veya bacakları düzenleyin. Grafik canlı güncellenir.';"
 ],
 [
  "title: { display: true, text: 'Simulation day', color: tc.text, font: { size: 10 } },",
  "title: { display: true, text: 'Simülasyon günü', color: tc.text, font: { size: 10 } },"
 ],
 [
  "var line = guide && guide.thesis ? guide.thesis : ('You are viewing ' + meta.title + '.');",
  "var line = guide && guide.thesis ? guide.thesis : ('Görüntülenen: ' + meta.title + '.');"
 ],
 [
  "vg > 5 ? 'Long volatility: +1% IV adds about $' + Math.abs(vg).toFixed(0) + '.'",
  "vg > 5 ? 'Long volatilite: IV +1% olursa yaklaşık $' + Math.abs(vg).toFixed(0) + ' kazandırır.'"
 ],
 [
  "x.title = 'Remove slice'; x.setAttribute('aria-label', 'Remove slice ' + (i + 1));",
  "x.title = 'Dilimi kaldır'; x.setAttribute('aria-label', 'Dilimi kaldır ' + (i + 1));"
 ],
 [
  "if (titleEl) titleEl.textContent = (meta ? meta.title : key) + ' — strategy guide';",
  "if (titleEl) titleEl.textContent = (meta ? meta.title : key) + ' — strateji rehberi';"
 ]
]

# Regex rules for lines that are identical in many places or not worth a table entry.
RULES = [
    # lesson-link labels in TEMPLATE_LESSONS that point at the Advanced level
    (re.compile(r"(href: '/level4/', label: )'Advanced'"), r"\1'İleri Seviye'"),
]

def build(src_path, out_path):
    src = open(src_path, encoding='utf-8').read().split('\n')
    table = dict((k, v) for k, v in TABLE)
    hits = dict.fromkeys(table, 0)
    out = []
    for line in src:
        s = line.strip()
        if s in table:
            indent = line[:len(line) - len(line.lstrip())]
            out.append(indent + table[s]); hits[s] += 1; continue
        for rx, rep in RULES:
            line = rx.sub(rep, line)
        out.append(line)
    header = '/* GENERATED by build_tr_engine.py from jsm-options-engine.js — do not edit by hand. */'
    open(out_path, 'w', encoding='utf-8').write(header + '\n' + '\n'.join(out))
    missed = [k for k, n in hits.items() if n == 0]
    print('translated lines :', sum(hits.values()))
    print('table entries    :', len(table))
    print('UNMATCHED entries:', len(missed))
    for k in missed:
        print('   -', k[:110])

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    build(sys.argv[1], sys.argv[2])
