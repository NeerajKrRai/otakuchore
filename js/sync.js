/* ============================================================
   sync.js — optional cross-device sync client (v2).
   Offline-first: localStorage is the source of truth/cache; this
   layer pushes local changes and pulls+merges remote ones against
   the sync Worker. Photos/videos are NOT synced (data only).
   Enabled only when CT_CONFIG.SYNC_URL is set.
   Depends on: DB (store.js), CT_CONFIG (config.js)
   Exposes: window.Sync
   ============================================================ */
(function () {
  'use strict';
  var DB = window.DB;
  var SYNC_KEY = 'ct_sync';        // { familyId, token, version } — local only
  var POLL_MS = 20000, PUSH_DEBOUNCE = 1500;

  var _status = 'off';             // off | unlinked | synced | syncing | offline | error
  var _pollTimer = null, _pushTimer = null, _pulling = false, _pushing = false, _dirty = false, _started = false;
  var _onChange = null, _onStatus = null;

  function cfgUrl() { return (window.CT_CONFIG && window.CT_CONFIG.SYNC_URL || '').replace(/\/+$/, ''); }
  function enabled() { return !!cfgUrl(); }
  function stateGet() { return DB.get(SYNC_KEY, null); }
  function stateSet(s) { DB.set(SYNC_KEY, s); }
  function isLinked() { var s = stateGet(); return !!(s && s.familyId && s.token); }

  function setStatus(st) { _status = st; if (_onStatus) { try { _onStatus(status()); } catch (e) {} } }
  function status() {
    if (!enabled()) return 'off';
    if (!isLinked()) return 'unlinked';
    return _status === 'off' ? 'synced' : _status;
  }

  function api(method, path, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(cfgUrl() + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      });
  }

  /* ---------------- create / join ---------------- */
  function createFamily() {
    if (!enabled()) return Promise.reject(new Error('sync-not-configured'));
    setStatus('syncing');
    return api('POST', '/family', { doc: DB.snapshot() }).then(function (r) {
      if (!r.ok) { setStatus('error'); throw new Error('create-failed'); }
      stateSet({ familyId: r.data.familyId, token: r.data.token, version: r.data.version });
      _dirty = false; setStatus('synced'); start();
      return r.data;
    });
  }
  function startPairing() {
    var s = stateGet(); if (!s) return Promise.reject(new Error('not-linked'));
    return api('POST', '/pair', { familyId: s.familyId }, s.token).then(function (r) {
      if (!r.ok) throw new Error('pair-failed');
      return r.data; // { code, ttl }
    });
  }
  function redeemCode(code) {
    if (!enabled()) return Promise.reject(new Error('sync-not-configured'));
    setStatus('syncing');
    return api('POST', '/pair/redeem', { code: code }).then(function (r) {
      if (!r.ok) { setStatus(isLinked() ? 'synced' : 'unlinked'); throw new Error((r.data && r.data.error) || 'invalid-code'); }
      var familyId = r.data.familyId, token = r.data.token;
      return api('GET', '/family/' + familyId, null, token).then(function (pr) {
        if (!pr.ok) { setStatus('error'); throw new Error('pull-failed'); }
        DB.replaceWith(pr.data.doc);                        // adopt the joined family wholesale
        DB.setMode({ role: 'locked', profileId: null });    // old active profile is no longer valid
        stateSet({ familyId: familyId, token: token, version: pr.data.version });
        _dirty = false; setStatus('synced'); start();
        if (_onChange) _onChange();
        return true;
      });
    });
  }
  function leave() {
    stop();
    DB.set(SYNC_KEY, null);
    setStatus('unlinked');
  }

  /* ---------------- pull / push ---------------- */
  function pull() {
    var s = stateGet(); if (!s || _pulling) return Promise.resolve();
    _pulling = true; if (_status !== 'offline') setStatus('syncing');
    return api('GET', '/family/' + s.familyId, null, s.token).then(function (r) {
      if (r.status === 401 || r.status === 404) { setStatus('error'); return; }
      if (!r.ok) { setStatus('offline'); return; }
      var changed = DB.mergeInto(r.data.doc);
      s.version = r.data.version; stateSet(s);
      setStatus('synced');
      if (changed && _onChange) _onChange();
      if (_dirty) pushSoon();                                // we have local edits to propagate
    }).catch(function () { setStatus('offline'); }).then(function () { _pulling = false; });
  }

  function push() {
    var s = stateGet(); if (!s || _pushing || !_dirty) return Promise.resolve();
    _pushing = true; _dirty = false;                          // optimistic; re-set on failure or mid-flight change
    if (_status !== 'offline') setStatus('syncing');
    var body = { doc: DB.snapshot(), baseVersion: s.version };
    return api('PUT', '/family/' + s.familyId, body, s.token).then(function (r) {
      if (r.ok) { s.version = r.data.version; stateSet(s); setStatus('synced'); return; }
      if (r.status === 409) {                                 // stale — merge server's copy, retry
        DB.mergeInto(r.data.doc); s.version = r.data.version; stateSet(s);
        _dirty = true; setStatus('synced');
        if (_onChange) _onChange();
        pushSoon();
        return;
      }
      _dirty = true; setStatus(r.status === 401 ? 'error' : 'offline');
    }).catch(function () { _dirty = true; setStatus('offline'); }).then(function () { _pushing = false; });
  }

  function pushSoon() {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function () { _pushTimer = null; push(); }, PUSH_DEBOUNCE);
  }

  /* ---------------- lifecycle ---------------- */
  function start() {
    if (!enabled() || !isLinked()) return;
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(function () { if (!document.hidden) pull(); }, POLL_MS);
    pull();
  }
  function stop() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
  }

  function init(handlers) {
    handlers = handlers || {};
    _onChange = handlers.onChange || null;
    _onStatus = handlers.onStatus || null;
    if (_started) return;
    _started = true;
    // any LOCAL write marks us dirty and schedules a push
    DB.subscribe(function () { if (isLinked()) { _dirty = true; pushSoon(); } });
    // sync opportunistically on reconnect / refocus
    window.addEventListener('online', function () { if (isLinked()) { pull(); if (_dirty) pushSoon(); } });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && isLinked()) pull(); });
    setStatus(enabled() ? (isLinked() ? 'synced' : 'unlinked') : 'off');
    if (isLinked()) start();
  }

  window.Sync = {
    init: init, enabled: enabled, isLinked: isLinked, status: status,
    createFamily: createFamily, startPairing: startPairing, redeemCode: redeemCode, leave: leave,
    pull: pull, push: push, pushSoon: pushSoon, start: start, stop: stop,
    familyId: function () { var s = stateGet(); return s ? s.familyId : null; }
  };
})();
