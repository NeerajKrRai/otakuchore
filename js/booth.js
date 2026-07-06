/* ============================================================
   booth.js — selfie proof booth + IndexedDB media store.
   Photos/videos NEVER touch localStorage (quota killer) — the
   binary lives in IndexedDB; only tiny metadata is in localStorage.
   Depends on: DB, Engine, UI
   Exposes: window.Media, window.Booth
   ============================================================ */
(function () {
  'use strict';
  var DB = window.DB, Engine = window.Engine;

  /* ---------------- Media: IndexedDB blob store ---------------- */
  var DB_NAME = 'ct_media', STORE = 'media', _idb = null;
  function idb() {
    return new Promise(function (resolve, reject) {
      if (_idb) return resolve(_idb);
      if (!window.indexedDB) return reject(new Error('no-indexeddb'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { _idb = req.result; resolve(_idb); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(mode) { return idb().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); }); }

  var Media = {
    put: function (id, blob) {
      return tx('readwrite').then(function (store) {
        return new Promise(function (res, rej) {
          var r = store.put(blob, id);
          r.onsuccess = function () { res(id); }; r.onerror = function () { rej(r.error); };
        });
      });
    },
    get: function (id) {
      return tx('readonly').then(function (store) {
        return new Promise(function (res, rej) {
          var r = store.get(id);
          r.onsuccess = function () { res(r.result ? URL.createObjectURL(r.result) : null); };
          r.onerror = function () { rej(r.error); };
        });
      });
    },
    remove: function (ids) {
      if (!Array.isArray(ids)) ids = [ids];
      return tx('readwrite').then(function (store) {
        ids.forEach(function (id) { try { store.delete(id); } catch (e) {} });
      }).catch(function () {});
    },
    clear: function () { return tx('readwrite').then(function (store) { store.clear(); }).catch(function () {}); }
  };
  window.Media = Media;

  /* ---------------- Booth ---------------- */
  var _stream = null, _target = null, _kidId = null, _cont = null;
  var _captured = null; // { blob, type:'photo'|'video', url }
  var _recorder = null, _chunks = [], _recTimer = null, _facing = 'user';

  function setTarget(choreId) { _target = choreId; }

  function stop() {
    if (_recorder && _recorder.state === 'recording') { try { _recorder.stop(); } catch (e) {} }
    if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
    if (_stream) { _stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); _stream = null; }
    _recorder = null; _chunks = [];
  }
  function clearCapture() {
    if (_captured && _captured.url) { try { URL.revokeObjectURL(_captured.url); } catch (e) {} }
    _captured = null;
  }

  function renderTab(container, kidId) {
    _cont = container; _kidId = kidId; clearCapture();
    var chores = Engine.choresForKid(kidId);
    var choreOpts = chores.length
      ? chores.map(function (c) {
          return '<option value="' + c.id + '"' + (c.id === _target ? ' selected' : '') + '>' +
            Engine.catInfo(c.category).emoji + ' ' + escAttr(c.title) + '</option>';
        }).join('')
      : '<option value="">No chores yet</option>';
    container.innerHTML =
      '<div class="booth-wrap">' +
        '<div class="booth-section">' +
          '<div class="booth-section-title">📸 Proof Booth</div>' +
          '<div class="camera-wrap"><div class="camera-placeholder" id="cam-ph">' +
            '<div style="font-size:44px">📷</div><div class="muted">Snap a photo or record a clip to prove your quest!</div></div>' +
            '<video class="camera-preview hidden" id="cam-vid" playsinline muted autoplay></video>' +
            '<div class="cam-overlay hidden" id="cam-ov"></div>' +
            '<div class="rec-indicator hidden" id="cam-rec"><div class="rec-dot"></div><div class="rec-text" id="cam-rectext">REC</div></div>' +
          '</div>' +
          '<div id="cam-controls"><button class="btn-primary" style="margin-top:10px" onclick="Booth.start()">📷 Start Camera</button>' +
            '<label class="btn-ghost" style="display:block;text-align:center;cursor:pointer">🖼️ Or upload a photo/video' +
            '<input type="file" accept="image/*,video/*" style="display:none" onchange="Booth.upload(this)"></label></div>' +
          '<div class="capture-btns hidden" id="cap-btns">' +
            '<button class="cap-btn photo" onclick="Booth.snap()">📸 Photo</button>' +
            '<button class="cap-btn video" id="vidbtn" onclick="Booth.record()">🎥 Video</button>' +
            '<button class="cap-btn flip" onclick="Booth.flip()">🔄</button>' +
          '</div>' +
          '<div id="preview-area"></div>' +
          '<div class="cam-tip">Tip: photos & videos stay on this device only.</div>' +
        '</div>' +
        '<div class="booth-section"><div class="booth-section-title">✨ Your Sent Proofs</div><div id="sent-proofs"></div></div>' +
      '</div>';
    renderSent();
  }

  function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      UI.toast('Camera not available — try upload instead'); return;
    }
    stop();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: _facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: true })
      .then(function (stream) {
        _stream = stream;
        var v = id('cam-vid'); if (!v) { stop(); return; }
        v.srcObject = stream; v.classList.remove('hidden');
        id('cam-ph').classList.add('hidden'); id('cam-ov').classList.remove('hidden');
        id('cam-controls').classList.add('hidden'); id('cap-btns').classList.remove('hidden');
      })
      .catch(function () { UI.toast('Could not open camera — try upload instead'); });
  }

  function flip() { _facing = _facing === 'user' ? 'environment' : 'user'; if (_stream) start(); }

  function snap() {
    var v = id('cam-vid'); if (!v || !v.videoWidth) return;
    var canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    var ctx = canvas.getContext('2d');
    if (_facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(function (blob) {
      if (!blob) return;
      setCaptured(blob, 'photo');
    }, 'image/jpeg', 0.82);
    UI.haptic(15);
  }

  function record() {
    if (_recorder && _recorder.state === 'recording') { try { _recorder.stop(); } catch (e) {} return; }
    if (!_stream) return;
    var types = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    var mime = ''; for (var i = 0; i < types.length; i++) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(types[i])) { mime = types[i]; break; } }
    try { _recorder = mime ? new MediaRecorder(_stream, { mimeType: mime, videoBitsPerSecond: 500000 }) : new MediaRecorder(_stream); }
    catch (e) { UI.toast('Recording not supported here'); return; }
    _chunks = [];
    _recorder.ondataavailable = function (e) { if (e.data && e.data.size) _chunks.push(e.data); };
    _recorder.onstop = function () {
      if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
      id('cam-rec').classList.add('hidden');
      var btn = id('vidbtn'); if (btn) { btn.classList.remove('recording'); btn.textContent = '🎥 Video'; }
      var blob = new Blob(_chunks, { type: (_recorder && _recorder.mimeType) || 'video/webm' });
      if (blob.size) setCaptured(blob, 'video');
    };
    _recorder.start();
    UI.haptic([12, 20, 12]);
    var btn = id('vidbtn'); if (btn) { btn.classList.add('recording'); btn.textContent = '⏹ Stop'; }
    id('cam-rec').classList.remove('hidden');
    var secs = 0;
    _recTimer = setInterval(function () {
      secs++; var t = id('cam-rectext'); if (t) t.textContent = 'REC ' + secs + 's';
      if (secs >= 10 && _recorder && _recorder.state === 'recording') { try { _recorder.stop(); } catch (e) {} } // 10s cap
    }, 1000);
  }

  function upload(input) {
    var file = input.files && input.files[0]; if (!file) return;
    var type = file.type.indexOf('video') === 0 ? 'video' : 'photo';
    setCaptured(file, type);
  }

  function setCaptured(blob, type) {
    clearCapture();
    _captured = { blob: blob, type: type, url: URL.createObjectURL(blob) };
    var chores = Engine.choresForKid(_kidId);
    var choreOpts = chores.length
      ? chores.map(function (c) { return '<option value="' + c.id + '"' + (c.id === _target ? ' selected' : '') + '>' + Engine.catInfo(c.category).emoji + ' ' + escAttr(c.title) + '</option>'; }).join('')
      : '';
    var media = type === 'video'
      ? '<video src="' + _captured.url + '" controls playsinline></video>'
      : '<img src="' + _captured.url + '" alt="proof">';
    id('preview-area').innerHTML =
      '<div class="preview-wrap">' + media + '<button class="preview-clear" onclick="Booth.discard()">✕ Retake</button></div>' +
      (chores.length
        ? '<div class="send-proof-row"><select id="proof-chore">' + choreOpts + '</select>' +
          '<button class="send-proof-btn" onclick="Booth.send()">Send Proof 🚀</button></div>'
        : '<div class="storage-warn" style="margin-top:10px">Add a chore first, then you can attach proof to it.</div>');
  }
  function discard() { clearCapture(); var pa = id('preview-area'); if (pa) pa.innerHTML = ''; }

  function send() {
    if (!_captured) return;
    var sel = id('proof-chore'); var choreId = sel ? sel.value : _target;
    if (!choreId) { UI.toast('Pick a chore for this proof'); return; }
    var proofId = DB.uuid(), mediaId = DB.uuid();
    var blob = _captured.blob, type = _captured.type;
    Media.put(mediaId, blob).then(function () {
      // create (or reuse) the kid's pending completion, tagged with this proof
      var comp = Engine.completeChore(choreId, _kidId, proofId);
      // ensure the completion points at our proof even if it already existed
      var comps = DB.completions();
      var cc = comps.find(function (x) { return x.id === comp.id; });
      if (cc) { cc.proofId = proofId; DB.setCompletions(comps); }
      var proofs = DB.proofs();
      proofs.push({
        id: proofId, choreId: choreId, completionId: comp.id, profileId: _kidId,
        type: type, mediaId: mediaId, at: DB.now(), status: 'pending', seen: false
      });
      DB.setProofs(proofs);
      UI.haptic(20); UI.celebrate('📸', 'Proof sent!');
      clearCapture();
      renderTab(_cont, _kidId); // reset the booth
    }).catch(function () { UI.toast('Could not save media on this device'); });
  }

  function renderSent() {
    var host = id('sent-proofs'); if (!host) return;
    var mine = DB.proofs().filter(function (p) { return p.profileId === _kidId; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    if (!mine.length) { host.innerHTML = '<div class="muted">No proofs yet — snap one above!</div>'; return; }
    host.innerHTML = mine.map(function (p) {
      var chore = DB.chore(p.choreId);
      var comp = DB.completions().find(function (c) { return c.id === p.completionId; });
      var status = comp ? comp.status : 'PENDING';
      var cls = status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'rejected' : 'pending';
      var label = status === 'APPROVED' ? '✓ Approved!' : status === 'REJECTED' ? '✗ Try again' : '⏳ Waiting';
      return '<div class="proof-card"><div class="proof-head"><div style="font-size:24px">' + (p.type === 'video' ? '🎥' : '📸') + '</div>' +
        '<div style="flex:1"><div style="font-weight:900;font-size:13px;color:var(--bright)">' + escHtml(chore ? chore.title : 'Chore') + '</div>' +
        '<div class="muted" style="font-size:10px">' + fmt(p.at) + '</div></div></div>' +
        '<div class="proof-media" id="sp-' + p.id + '"></div>' +
        '<div class="proof-status ' + cls + '">' + label + '</div></div>';
    }).join('');
    mine.forEach(function (p) {
      if (!p.mediaId) return;
      Media.get(p.mediaId).then(function (url) {
        var slot = id('sp-' + p.id); if (!slot || !url) return;
        slot.innerHTML = p.type === 'video' ? '<video src="' + url + '" controls playsinline></video>' : '<img src="' + url + '" alt="">';
      }).catch(function () {});
    });
  }

  /* helpers */
  function id(x) { return document.getElementById(x); }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;'); }
  function fmt(iso) { try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }

  window.Booth = {
    setTarget: setTarget, renderTab: renderTab, stop: stop,
    start: start, flip: flip, snap: snap, record: record, upload: upload, send: send, discard: discard
  };
})();
