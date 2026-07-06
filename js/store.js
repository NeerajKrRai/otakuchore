/* ============================================================
   store.js — localStorage persistence + sync-safe data model.
   One install = one family (the local cache of a cloud family).
   Every record carries updatedAt; deletes are tombstones
   (deleted:true) so multi-device merge is conflict-free.
   `mode` is DEVICE-LOCAL and never synced.
   Exposes: window.DB
   ============================================================ */
(function () {
  'use strict';

  var KEYS = {
    family:      'ct_family',       // { name, createdAt, updatedAt }
    seeded:      'ct_seeded',       // { chores:bool, rewards:bool, updatedAt }
    profiles:    'ct_profiles',
    chores:      'ct_chores',
    completions: 'ct_completions',
    rewards:     'ct_rewards',
    redemptions: 'ct_redemptions',
    ledger:      'ct_ledger',
    proofs:      'ct_proofs',
    messages:    'ct_messages',
    mode:        'ct_mode'          // { role, profileId } — LOCAL ONLY, not synced
  };
  // collections that are part of the syncable family document (arrays of records)
  var COLLECTIONS = ['profiles', 'chores', 'completions', 'rewards', 'redemptions', 'ledger', 'proofs', 'messages'];
  // singletons that sync (merge by updatedAt)
  var SINGLETONS = ['family', 'seeded'];

  /* ---- raw get/set ---- */
  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) { console.warn('DB.get failed', key, e); return fallback; }
  }
  function set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn('DB.set failed', key, e); return false; }
  }

  /* ---- id + time ---- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.floor(performance.now() * 1000).toString(36) + '-' +
      (window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36) : Math.floor(performance.now()).toString(36));
  }
  function now() { return new Date().toISOString(); }

  /* ---- change notification (local writes only; sync-applied merges do NOT fire) ---- */
  var _subs = [];
  function subscribe(fn) { _subs.push(fn); return function () { _subs = _subs.filter(function (f) { return f !== fn; }); }; }
  function notifyLocal() { for (var i = 0; i < _subs.length; i++) { try { _subs[i](); } catch (e) {} } }

  /* ---- collection API ---- */
  function keyOf(name) { return KEYS[name] || name; }
  function rawList(name) { return get(keyOf(name), []); }
  function setRaw(name, arr) { return set(keyOf(name), arr); }
  function list(name) { return rawList(name).filter(function (r) { return !r.deleted; }); }
  function find(name, id) {
    var arr = rawList(name);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id && !arr[i].deleted) return arr[i];
    return null;
  }
  // insert-or-replace by id; stamps updatedAt; returns the stored record
  function upsert(name, rec) {
    if (!rec.id) rec.id = uuid();
    rec.updatedAt = now();
    var arr = rawList(name), idx = -1;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { idx = i; break; }
    if (idx >= 0) arr[idx] = rec; else arr.push(rec);
    setRaw(name, arr);
    notifyLocal();
    return rec;
  }
  // soft-delete (tombstone) so the deletion propagates through sync
  function remove(name, id) {
    var arr = rawList(name), changed = false;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id && !arr[i].deleted) { arr[i].deleted = true; arr[i].updatedAt = now(); changed = true; break; }
    }
    if (changed) { setRaw(name, arr); notifyLocal(); }
    return changed;
  }

  /* ---- singletons ---- */
  function family() { return get(KEYS.family, null); }
  function setFamily(f) { f = f || {}; f.updatedAt = now(); var r = set(KEYS.family, f); notifyLocal(); return r; }
  function seeded() { return get(KEYS.seeded, { chores: false, rewards: false }); }
  function setSeeded(s) { s = s || {}; s.updatedAt = now(); var r = set(KEYS.seeded, s); notifyLocal(); return r; }
  function mode() { return get(KEYS.mode, { role: 'locked', profileId: null }); }
  function setMode(m) { return set(KEYS.mode, m); } // local only, no updatedAt, not synced

  /* ---- sync document (raw, incl tombstones; NO mode) ---- */
  function snapshot() {
    var doc = { family: family(), seeded: seeded() };
    COLLECTIONS.forEach(function (c) { doc[c] = rawList(c); });
    return doc;
  }
  // newest-updatedAt-wins, deterministic tie-break (greater JSON) for convergence
  function pickNewer(a, b) {
    if (!a) return b; if (!b) return a;
    var ta = a.updatedAt || '', tb = b.updatedAt || '';
    if (ta > tb) return a;
    if (tb > ta) return b;
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  }
  function mergeCollections(localArr, remoteArr) {
    var byId = {};
    (localArr || []).forEach(function (r) { byId[r.id] = r; });
    (remoteArr || []).forEach(function (r) { byId[r.id] = pickNewer(byId[r.id], r); });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }
  // merge a remote family doc into the local store (ongoing sync). returns true if local changed.
  function mergeInto(remoteDoc) {
    if (!remoteDoc) return false;
    var before = JSON.stringify(snapshot());
    SINGLETONS.forEach(function (s) {
      if (remoteDoc[s] !== undefined) {
        var merged = pickNewer(get(KEYS[s], null), remoteDoc[s]);
        if (merged) set(KEYS[s], merged);
      }
    });
    COLLECTIONS.forEach(function (c) {
      if (remoteDoc[c] !== undefined) setRaw(c, mergeCollections(rawList(c), remoteDoc[c]));
    });
    return JSON.stringify(snapshot()) !== before;
  }
  // replace local family data wholesale (used when JOINING a cloud family). mode reset by caller.
  function replaceWith(remoteDoc) {
    if (!remoteDoc) return;
    SINGLETONS.forEach(function (s) { if (remoteDoc[s] !== undefined) set(KEYS[s], remoteDoc[s]); });
    COLLECTIONS.forEach(function (c) { setRaw(c, remoteDoc[c] || []); });
  }

  /* ---- misc ---- */
  function hasFamily() { return family() !== null; }
  function wipe() {
    Object.keys(KEYS).forEach(function (k) { try { localStorage.removeItem(KEYS[k]); } catch (e) {} });
  }
  function exportAll() {
    var doc = snapshot();
    doc.exportedAt = now();
    return doc;
  }

  var DB = {
    KEYS: KEYS, COLLECTIONS: COLLECTIONS,
    get: get, set: set, uuid: uuid, now: now, subscribe: subscribe,
    // collection API
    rawList: rawList, setRaw: setRaw, list: list, find: find, upsert: upsert, remove: remove,
    // convenience live getters
    profiles:    function () { return list('profiles'); },
    chores:      function () { return list('chores'); },
    completions: function () { return list('completions'); },
    rewards:     function () { return list('rewards'); },
    redemptions: function () { return list('redemptions'); },
    ledger:      function () { return list('ledger'); },
    proofs:      function () { return list('proofs'); },
    messages:    function () { return list('messages'); },
    profile: function (id) { return find('profiles', id); },
    chore:   function (id) { return find('chores', id); },
    reward:  function (id) { return find('rewards', id); },
    // singletons
    family: family, setFamily: setFamily, seeded: seeded, setSeeded: setSeeded, mode: mode, setMode: setMode,
    // sync
    snapshot: snapshot, mergeInto: mergeInto, replaceWith: replaceWith, mergeCollections: mergeCollections, pickNewer: pickNewer,
    // misc
    hasFamily: hasFamily, wipe: wipe, exportAll: exportAll
  };
  window.DB = DB;
})();
