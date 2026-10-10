if (!window.__audit) {
  const A = window.__audit = {errors:[], warns:[], toasts:[], ipc:[], net:[], dialogQueue:[], t0:Date.now()};
  const short = v => { try { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 300 ? s.slice(0,300)+'…' : s; } catch(e) { return String(v); } };
  const oe = console.error.bind(console), ow = console.warn.bind(console);
  console.error = (...a) => { A.errors.push(a.map(short).join(' ')); oe(...a); };
  console.warn = (...a) => { A.warns.push(a.map(short).join(' ')); ow(...a); };
  window.addEventListener('error', e => A.errors.push('UNCAUGHT ' + (e.message||'') + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => A.errors.push('UNHANDLED ' + short(e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  const st = window.showToast;
  if (st) window.showToast = function(msg, type) { A.toasts.push(String(msg) + (type ? ' ['+type+']' : '')); return st.apply(this, arguments); };
  const T = window.__TAURI__;
  A.hooked = [];
  for (const ns of ['dialog','fs','core','opener','process','updater','path']) {
    const obj = T && T[ns]; if (!obj) continue;
    for (const k of Object.keys(obj)) {
      const orig = obj[k]; if (typeof orig !== 'function' || /^[A-Z]/.test(k)) continue;
      const wrapped = async function(...args) {
        const rec = {cmd: ns + '.' + k, args: short(args), t: Date.now()};
        A.ipc.push(rec);
        if (ns === 'dialog' && (k === 'open' || k === 'save')) {
          const v = A.dialogQueue.length ? A.dialogQueue.shift() : null; rec.stub = v; return v;
        }
        if (ns === 'dialog') { rec.stub = true; return true; }
        try { const r = await orig.apply(obj, args); rec.ok = true; rec.res = short(r); return r; }
        catch (e) { rec.err = short(e); throw e; }
      };
      try { obj[k] = wrapped; if (obj[k] === wrapped) A.hooked.push(ns + '.' + k); } catch(e) {}
    }
  }
  A.invokeHooked = A.hooked.includes('dialog.open');
  const of = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = (init && init.method) || 'GET';
    const rec = {url: url.slice(0,200), method, body: init && init.body ? String(init.body).length : 0, t: Date.now()};
    A.net.push(rec);
    if (/trophynav\.ru\/api\//.test(url) && !/tiles-catalog\.json/.test(url)) {
      rec.blocked = true; rec.bodySnippet = init && init.body ? String(init.body).slice(0, 400) : ''; rec.headers = init && init.headers ? Object.keys(init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers).join(',') : '';
      const stub = A.netStub && A.netStub(url, method, init);
      if (stub) return new Response(JSON.stringify(stub.body), {status: stub.status||200, headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify({error:'audit: запрос к серверу заблокирован'}), {status: 503, headers:{'Content-Type':'application/json'}});
    }
    if (/api\.github\.com/.test(url)) { rec.blocked = true; return new Response('{}', {status:503}); }
    try { const r = await of(input, init); rec.status = r.status; return r; } catch(e) { rec.err = String(e); throw e; }
  };
  A.dump = (clear) => { const o = {errors:A.errors.slice(), warns:A.warns.slice(), toasts:A.toasts.slice(), ipc:A.ipc.slice(), net:A.net.slice()}; if (clear) { A.errors.length=0; A.warns.length=0; A.toasts.length=0; A.ipc.length=0; A.net.length=0; } return o; };
}
return {hooked: window.__audit.hooked.length, dialog: window.__audit.invokeHooked};
