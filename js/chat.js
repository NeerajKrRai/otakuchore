/* ============================================================
   chat.js — per-quest chat thread (parent ↔ kid).
   Opens as an overlay; identity = the currently acting profile.
   Depends on: DB   Exposes: window.Chat
   ============================================================ */
(function () {
  'use strict';
  var DB = window.DB;
  var _choreId = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function me() { return DB.profile(DB.mode().profileId); }
  function myRole() { return DB.mode().role === 'parent' ? 'parent' : 'kid'; }

  function open(choreId) {
    _choreId = choreId;
    var chore = DB.chore(choreId);
    var m = document.getElementById('modal');
    m.innerHTML =
      '<div class="modal-box" style="max-width:440px;width:92vw;height:82dvh;display:flex;flex-direction:column;padding:16px;text-align:left">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<div class="quest-banner" style="margin:0;flex:1">💬 ' + esc(chore ? chore.title : 'Quest') + '</div>' +
          '<button class="icon-btn" style="margin-left:8px" onclick="UI.closeModal()">✕</button>' +
        '</div>' +
        '<div class="msgs-wrap" id="chat-msgs" style="flex:1"></div>' +
        '<div class="chat-row"><input id="chat-input" placeholder="Type a message…" maxlength="300" ' +
          'onkeydown="if(event.key===\'Enter\'){Chat.send();}"><button class="send-btn" onclick="Chat.send()">➤</button></div>' +
      '</div>';
    m.classList.add('open');
    m.onclick = function (e) { if (e.target === m) UI.closeModal(); };
    renderMsgs();
    setTimeout(function () { var i = document.getElementById('chat-input'); if (i) i.focus(); }, 100);
  }

  function renderMsgs() {
    var host = document.getElementById('chat-msgs'); if (!host) return;
    var msgs = DB.messages().filter(function (x) { return x.choreId === _choreId; });
    if (!msgs.length) {
      host.innerHTML = '<div class="no-chat"><div style="font-size:40px">🗨️</div><div class="muted">No messages yet.<br>Say hello about this quest!</div></div>';
      return;
    }
    host.innerHTML = msgs.map(function (msg) {
      var side = msg.role === 'parent' ? 'parent' : 'kid';
      return '<div class="msg-bwrap ' + side + '"><div class="msg-from">' + esc(msg.from) + '</div>' +
        '<div class="msg-bub">' + esc(msg.text) + '</div>' +
        '<div class="msg-time">' + fmtTime(msg.at) + '</div></div>';
    }).join('');
    host.scrollTop = host.scrollHeight;
  }

  function send() {
    var input = document.getElementById('chat-input'); if (!input) return;
    var text = input.value.trim(); if (!text) return;
    var p = me(); if (!p) return;
    var msgs = DB.messages();
    msgs.push({ id: DB.uuid(), choreId: _choreId, profileId: p.id, from: p.name, role: myRole(), text: text, at: DB.now() });
    DB.setMessages(msgs);
    input.value = '';
    if (window.UI) UI.haptic(8);
    renderMsgs();
  }

  window.Chat = { open: open, send: send };
})();
