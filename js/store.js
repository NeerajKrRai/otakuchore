/* ============================================================
   store.js — localStorage persistence layer (zero backend)
   One install = one family. All data lives on this device.
   Exposes: window.DB
   ============================================================ */
(function () {
  'use strict';

  var KEYS = {
    family:      'ct_family',       // { name, createdAt }
    profiles:    'ct_profiles',     // [ profile ]
    chores:      'ct_chores',       // [ chore ]
    completions: 'ct_completions',  // [ completion ]  (chore approval queue)
    rewards:     'ct_rewards',      // [ reward ]
    redemptions: 'ct_redemptions',  // [ redemption ]  (reward approval queue)
    ledger:      'ct_ledger',       // [ ledgerEntry ]
    proofs:      'ct_proofs',       // [ proof ]        (media binary lives in IndexedDB)
    messages:    'ct_messages',     // [ message ]      (per-quest chat)
    mode:        'ct_mode',         // { role:'locked'|'parent'|'kid', profileId }
    seeded:      'ct_seeded'        // { chores:bool, rewards:bool } — starter packs offered-once
  };

  /* ---- raw get/set with safe JSON + quota guard ---- */
  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('DB.get failed for', key, e);
      return fallback;
    }
  }
  function set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      // localStorage is small; we never put media here, so this should be rare.
      console.warn('DB.set failed for', key, e);
      return false;
    }
  }

  /* ---- id + time helpers (replace DynamoDB-managed fields) ---- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.floor(performance.now() * 1000).toString(36) + '-' +
           (window.crypto && crypto.getRandomValues
             ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
             : Math.floor(performance.now()).toString(36));
  }
  function now() { return new Date().toISOString(); }

  /* ---- collection accessors (always return an array) ---- */
  function coll(key) { return get(key, []); }
  function saveColl(key, arr) { return set(key, arr); }

  var DB = {
    KEYS: KEYS,
    get: get,
    set: set,
    uuid: uuid,
    now: now,

    /* whole-collection getters */
    profiles:    function () { return coll(KEYS.profiles); },
    chores:      function () { return coll(KEYS.chores); },
    completions: function () { return coll(KEYS.completions); },
    rewards:     function () { return coll(KEYS.rewards); },
    redemptions: function () { return coll(KEYS.redemptions); },
    ledger:      function () { return coll(KEYS.ledger); },
    proofs:      function () { return coll(KEYS.proofs); },
    messages:    function () { return coll(KEYS.messages); },

    /* whole-collection setters */
    setProfiles:    function (a) { return saveColl(KEYS.profiles, a); },
    setChores:      function (a) { return saveColl(KEYS.chores, a); },
    setCompletions: function (a) { return saveColl(KEYS.completions, a); },
    setRewards:     function (a) { return saveColl(KEYS.rewards, a); },
    setRedemptions: function (a) { return saveColl(KEYS.redemptions, a); },
    setLedger:      function (a) { return saveColl(KEYS.ledger, a); },
    setProofs:      function (a) { return saveColl(KEYS.proofs, a); },
    setMessages:    function (a) { return saveColl(KEYS.messages, a); },

    /* singletons */
    family:    function () { return get(KEYS.family, null); },
    setFamily: function (f) { return set(KEYS.family, f); },
    mode:      function () { return get(KEYS.mode, { role: 'locked', kidId: null }); },
    setMode:   function (m) { return set(KEYS.mode, m); },
    seeded:    function () { return get(KEYS.seeded, { chores: false, rewards: false }); },
    setSeeded: function (s) { return set(KEYS.seeded, s); },

    /* find-by-id helpers */
    profile: function (id) { return DB.profiles().find(function (p) { return p.id === id; }) || null; },
    chore:   function (id) { return DB.chores().find(function (c) { return c.id === id; }) || null; },
    reward:  function (id) { return DB.rewards().find(function (r) { return r.id === id; }) || null; },

    /* has a family been created yet? */
    hasFamily: function () { return DB.family() !== null; },

    /* nuke everything (used by "reset app" in settings) */
    wipe: function () {
      Object.keys(KEYS).forEach(function (k) {
        try { localStorage.removeItem(KEYS[k]); } catch (e) {}
      });
    },

    /* export the whole family as a plain object (backup / future share) */
    exportAll: function () {
      return {
        family:      DB.family(),
        profiles:    DB.profiles(),
        chores:      DB.chores(),
        completions: DB.completions(),
        rewards:     DB.rewards(),
        redemptions: DB.redemptions(),
        ledger:      DB.ledger(),
        proofs:      DB.proofs(),
        messages:    DB.messages(),
        exportedAt:  now()
      };
    }
  };

  window.DB = DB;
})();
