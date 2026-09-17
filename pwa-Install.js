// JSM Options - PWA Install Button (additive, no HTML edits needed except including this file)
(function(){
  let deferredPrompt = null;
  const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  // --- Inject minimal CSS ---
  const style = document.createElement('style');
  style.textContent = `
    #pwaInstallBtn{display:none;align-items:center;gap:8px;padding:12px 17px;border-radius:10px;font-weight:800;border:1px solid var(--border,#2d3a4f);background:var(--card,#1a2332);color:var(--text,#e7ecf3);cursor:pointer;transition:.15s transform,.15s border-color;font-family:inherit}
    #pwaInstallBtn.show{display:inline-flex}
    #pwaInstallBtn:hover{transform:translateY(-1px);border-color:var(--accent,#22c55e)}
    #pwaInstallBtn svg{width:16px;height:16px}
    .pwa-ios-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:9999;padding:18px}
    .pwa-ios-modal.open{display:flex}
    .pwa-ios-card{max-width:360px;width:100%;background:#1a2332;border:1px solid #2d3a4f;border-radius:16px;padding:22px;color:#e7ecf3}
    .pwa-ios-card h3{margin:0 0 8px;font-size:18px}
    .pwa-ios-card p{margin:0 0 10px;font-size:13px;color:#9aa8bd;line-height:1.5}
    .pwa-ios-card ol{margin:10px 0 0 18px;font-size:13px;line-height:1.6}
    .pwa-ios-card .close{margin-top:14px;width:100%;padding:10px;border-radius:10px;border:1px solid #2d3a4f;background:#111a28;color:#e7ecf3;font-weight:700;cursor:pointer}
  `;
  document.head.appendChild(style);

  // --- Create Install Button ---
  function createButton(){
    if(document.getElementById('pwaInstallBtn')) return document.getElementById('pwaInstallBtn');
    const btn = document.createElement('button');
    btn.id = 'pwaInstallBtn';
    btn.setAttribute('aria-label','Install the App');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/><path d="M3 19h18"/></svg> Install the App';
    return btn;
  }

  function injectButton(){
    if(isInStandalone) return;
    const btn = createButton();
    // Try to place in existing hero-actions (matches your site), otherwise floating bottom-right
    const hero = document.querySelector('.hero-actions');
    if(hero){
      hero.prepend(btn);
    } else {
      // fallback floating
      btn.style.position = 'fixed';
      btn.style.bottom = '18px';
      btn.style.right = '18px';
      btn.style.zIndex = '9998';
      btn.style.boxShadow = '0 8px 24px rgba(0,0,0,.3)';
      document.body.appendChild(btn);
    }
    // Show after short delay
    setTimeout(()=>{ if(!isInStandalone) btn.classList.add('show'); }, 800);
    return btn;
  }

  // --- Create iOS Modal ---
  function createModal(){
    if(document.getElementById('pwaIosModal')) return;
    const div = document.createElement('div');
    div.id = 'pwaIosModal';
    div.className = 'pwa-ios-modal';
    div.innerHTML = `
      <div class="pwa-ios-card">
        <h3>Install JSM Options</h3>
        <p>Install this app on your device for fast offline access:</p>
        <ol>
          <li>Tap the <b>Share</b> button in Safari</li>
          <li>Tap <b>Add to Home Screen</b></li>
          <li>Tap <b>Add</b></li>
        </ol>
        <p style="margin-top:10px">On Android: Menu ⋮ → Install app</p>
        <button class="close">Got it</button>
      </div>`;
    document.body.appendChild(div);
    div.addEventListener('click', (e)=>{ if(e.target===div) div.classList.remove('open'); });
    div.querySelector('.close').addEventListener('click', ()=> div.classList.remove('open'));
  }

  // --- Logic ---
  let btnRef = null;

  window.addEventListener('DOMContentLoaded', ()=>{
    createModal();
    btnRef = injectButton();
  });

  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    if(!btnRef) btnRef = injectButton();
    if(btnRef) btnRef.classList.add('show');
  });

  async function triggerInstall(){
    if(deferredPrompt){
      deferredPrompt.prompt();
      const {outcome} = await deferredPrompt.userChoice;
      if(outcome === 'accepted'){
        if(btnRef) btnRef.style.display='none';
      }
      deferredPrompt = null;
      return;
    }
    const modal = document.getElementById('pwaIosModal');
    if(modal) modal.classList.add('open');
  }

  document.addEventListener('click', (e)=>{
    if(e.target.closest('#pwaInstallBtn')){
      triggerInstall();
    }
  });

  window.addEventListener('appinstalled', ()=>{
    if(btnRef) btnRef.style.display='none';
  });

  // Register SW
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    });
  }
})();
