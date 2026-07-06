/* ============================================================
   ui.js — screens, rendering, and all interaction.
   Anime look (OtakuChore) + parenting engine (chore-tracker).
   Depends on: DB, Engine, CTAvatar, Booth, Chat, Media
   Exposes: window.UI
   ============================================================ */
(function () {
  'use strict';
  var DB = window.DB, Engine = window.Engine;

  /* ---------------- helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) {} }
  function fmtTime(iso) {
    try {
      var d = new Date(iso), now = new Date();
      var sameDay = d.toDateString() === now.toDateString();
      var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return sameDay ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + t;
    } catch (e) { return ''; }
  }
  // avatar inner HTML: SVG image if the profile has an avatarCfg, else the emoji
  function avatarInner(profile) {
    if (profile && profile.avatarCfg && window.CTAvatar) {
      return '<img alt="" src="' + CTAvatar.svg(profile.avatarCfg) + '">';
    }
    return esc(profile ? profile.avatar : '❓');
  }

  /* ---------------- state ---------------- */
  function mode() { return DB.mode(); }
  function role() { return mode().role; }
  function actingProfile() { return DB.profile(mode().profileId); }

  /* ---------------- modal ---------------- */
  function openModal(innerHTML, opts) {
    opts = opts || {};
    var m = $('modal');
    m.innerHTML = '<div class="modal-box' + (opts.danger ? ' danger' : '') + '">' + innerHTML + '</div>';
    m.classList.add('open');
    if (!opts.sticky) {
      m.onclick = function (e) { if (e.target === m) closeModal(); };
    } else { m.onclick = null; }
  }
  function closeModal() { var m = $('modal'); m.classList.remove('open'); m.innerHTML = ''; m.onclick = null; }
  function confirmModal(title, sub, yesLabel, onYes) {
    openModal(
      '<div class="modal-title">' + esc(title) + '</div>' +
      '<div class="modal-sub">' + sub + '</div>' +
      '<button class="modal-confirm-btn" id="cf-yes">' + esc(yesLabel) + '</button>' +
      '<button class="modal-cancel-btn" onclick="UI.closeModal()">← Cancel</button>',
      { danger: true }
    );
    $('cf-yes').onclick = function () { closeModal(); onYes(); };
  }

  /* ---------------- toast (replaces alert) ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1200;' +
      'background:linear-gradient(135deg,#250050,#3b0080);color:#ede9fe;border:1.5px solid #c084fc;' +
      'padding:11px 18px;border-radius:14px;font-weight:800;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.4);' +
      'max-width:88%;text-align:center;animation:popIn .25s ease;';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (t) t.remove(); }, 2600);
  }

  /* ---------------- celebration ---------------- */
  function celebrate(emoji, msg) {
    haptic([12, 40, 20]);
    var c = $('celebrate');
    c.innerHTML = '<div class="celebrate-inner"><div class="celebrate-emoji">' + esc(emoji) +
      '</div><div class="celebrate-msg">' + esc(msg) + '</div></div>';
    c.classList.add('show');
    setTimeout(function () { c.classList.remove('show'); }, 1400);
  }

  /* ---------------- screen routing ---------------- */
  var SCREENS = ['screen-welcome', 'screen-hub', 'screen-entry', 'screen-success'];
  function showScreen(id) {
    if (window.Booth && Booth.stop) Booth.stop();
    SCREENS.forEach(function (s) { var el = $(s); if (el) el.classList.remove('active'); });
    $('main-screen').classList.remove('active');
    if (id === 'main-screen') $('main-screen').classList.add('active');
    else { var el = $(id); if (el) el.classList.add('active'); }
  }
  function route() {
    if (!DB.hasFamily()) { renderWelcome(); showScreen('screen-welcome'); return; }
    var m = mode();
    if (m.role !== 'locked' && DB.profile(m.profileId)) {
      renderMain(); showScreen('main-screen');
      switchTab(m.role === 'parent' ? 'chores' : 'home'); // pick a default tab (needed on reload)
      return;
    }
    renderHub(); showScreen('screen-hub');
  }

  /* ============================================================
     WELCOME — create family
     ============================================================ */
  function renderWelcome() {
    var emojiChips = Engine.AVATAR_EMOJIS.slice(0, 14).map(function (e, i) {
      return '<button type="button" class="chip' + (i === 0 ? ' active' : '') +
        '" data-emoji="' + e + '" onclick="UI.pickWelcomeAvatar(this)">' + e + '</button>';
    }).join('');
    $('screen-welcome').innerHTML =
      '<div class="logo">⚡ OtakuChore</div>' +
      '<div class="tagline">LEVEL UP YOUR CHORES!</div>' +
      '<div class="spacer"></div>' +
      '<div class="card">' +
        '<div class="card-title">Start Your Family ✦</div>' +
        '<div class="field"><label>Family Name</label><input id="w-fam" placeholder="e.g. The Rai Family" maxlength="30"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>Your Name (Parent)</label><input id="w-name" placeholder="e.g. Mum" maxlength="20"></div>' +
        '</div>' +
        '<div class="field"><label>Your Avatar</label><div class="chip-grid" id="w-avatars">' + emojiChips + '</div></div>' +
        '<div class="field"><label>Parent PIN (4 digits, keeps kids out of parent mode)</label>' +
          '<input id="w-pin" type="password" inputmode="numeric" maxlength="4" placeholder="Recommended, e.g. 1234"></div>' +
        '<div class="err" id="w-err"></div>' +
        '<button class="btn-primary" onclick="UI.submitWelcome()">🎌 Create Family!</button>' +
      '</div>';
    $('screen-welcome')._avatar = Engine.AVATAR_EMOJIS[0];
  }
  function pickWelcomeAvatar(btn) {
    var grid = $('w-avatars');
    Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('active'); });
    btn.classList.add('active');
    $('screen-welcome')._avatar = btn.getAttribute('data-emoji');
  }
  function submitWelcome() {
    var fam = $('w-fam').value.trim(), name = $('w-name').value.trim();
    var pin = $('w-pin').value.trim(), av = $('screen-welcome')._avatar || '👑';
    if (!fam) { $('w-err').textContent = 'Please name your family'; return; }
    if (!name) { $('w-err').textContent = 'Please enter your name'; return; }
    if (pin && !/^\d{4}$/.test(pin)) { $('w-err').textContent = 'PIN must be 4 digits'; return; }
    var parent = Engine.createFamily(fam, { name: name, avatar: av, pin: pin || null });
    DB.setMode({ role: 'parent', profileId: parent.id });
    haptic(20);
    renderMain(); showScreen('main-screen'); switchTab('family');
    toast('Family created! Add your kids and some chores ✨');
  }

  /* ============================================================
     HUB — lock screen / who's using
     ============================================================ */
  function renderHub() {
    var fam = DB.family();
    var profiles = DB.profiles();
    var slots = profiles.map(function (p, i) {
      var pts = p.role === 'CHILD' ? '<div class="m-pts">' + p.pointsBalance + ' ⭐</div>' : '';
      var lock = p.pin ? '<div class="lock">🔒</div>' : '';
      return '<div class="member-slot ' + (p.role === 'PARENT' ? 'parent' : '') + '" style="animation-delay:' + (i * 0.06) + 's" onclick="UI.enterProfile(\'' + p.id + '\')">' +
        '<div class="ring">' + avatarInner(p) + lock + '</div>' +
        '<div class="m-name">' + esc(p.name) + '</div>' +
        '<div class="m-role">' + (p.role === 'PARENT' ? 'Parent' : 'Kid') + '</div>' + pts +
        '</div>';
    }).join('');
    $('screen-hub').innerHTML =
      '<div class="hub-header"><div class="logo" style="font-size:40px">⚡ OtakuChore</div>' +
        '<p>' + esc(fam ? fam.name : 'Your Family') + '</p></div>' +
      '<div class="who">Who\'s questing? ♪</div>' +
      '<div class="member-scene"><div class="notes-layer" id="hub-notes"></div>' +
        '<div class="member-grid">' + slots + '</div></div>';
    if (window.FX && FX.notes) FX.notes($('hub-notes'));
  }
  function enterProfile(id) {
    var p = DB.profile(id);
    if (!p) return;
    haptic();
    if (p.pin) { renderEntry(id); showScreen('screen-entry'); }
    else enterApp(id);
  }
  function lock() { DB.setMode({ role: 'locked', profileId: null }); renderHub(); showScreen('screen-hub'); }

  /* ============================================================
     ENTRY — PIN unlock
     ============================================================ */
  var entryTarget = null, entryBuf = '';
  function renderEntry(id) {
    entryTarget = id; entryBuf = '';
    var p = DB.profile(id);
    $('screen-entry').innerHTML =
      '<button class="btn-ghost" style="max-width:120px;align-self:flex-start" onclick="UI.lock()">← Back</button>' +
      '<div style="font-size:52px;animation:float 3s ease-in-out infinite;margin-top:10px">' + avatarInner(p) + '</div>' +
      '<div style="font-weight:900;font-size:20px;color:var(--bright);margin-top:8px">' + esc(p.name) + '</div>' +
      '<div class="muted" style="margin:3px 0 6px">Enter your PIN</div>' +
      '<div class="pin-display" id="entry-dots">' + [0,1,2,3].map(function(){return '<div class="pin-circle"></div>';}).join('') + '</div>' +
      '<div class="pin-grid">' +
        [1,2,3,4,5,6,7,8,9].map(function(n){return '<button class="pin-k" onclick="UI.entryKey(\''+n+'\')">'+n+'</button>';}).join('') +
        '<button class="pin-k" disabled></button>' +
        '<button class="pin-k" onclick="UI.entryKey(\'0\')">0</button>' +
        '<button class="pin-k" onclick="UI.entryKey(\'del\')">⌫</button>' +
      '</div>';
  }
  function entryKey(k) {
    haptic(8);
    if (k === 'del') entryBuf = entryBuf.slice(0, -1);
    else if (entryBuf.length < 4) entryBuf += k;
    var dots = $('entry-dots').children;
    for (var i = 0; i < 4; i++) dots[i].classList.toggle('on', i < entryBuf.length);
    if (entryBuf.length === 4) {
      var p = DB.profile(entryTarget);
      if (p && p.pin === entryBuf) { enterApp(entryTarget); }
      else {
        $('entry-dots').classList.add('shake');
        haptic([30, 40, 30]);
        setTimeout(function () {
          $('entry-dots').classList.remove('shake');
          entryBuf = '';
          for (var i = 0; i < 4; i++) $('entry-dots').children[i].classList.remove('on');
        }, 500);
      }
    }
  }

  /* ============================================================
     ENTER APP
     ============================================================ */
  function enterApp(id) {
    var p = DB.profile(id);
    DB.setMode({ role: p.role === 'PARENT' ? 'parent' : 'kid', profileId: id });
    haptic(18);
    renderMain(); showScreen('main-screen');
    switchTab(p.role === 'PARENT' ? 'chores' : 'home');
  }

  /* ============================================================
     MAIN SHELL
     ============================================================ */
  var PARENT_TABS = [
    { key: 'chores', icon: '📋', label: 'Chores' },
    { key: 'rewards', icon: '🎁', label: 'Rewards' },
    { key: 'approvals', icon: '✅', label: 'Approve' },
    { key: 'family', icon: '👨‍👩‍👧', label: 'Family' }
  ];
  var KID_TABS = [
    { key: 'home', icon: '⭐', label: 'Quests' },
    { key: 'rewards', icon: '🎁', label: 'Rewards' },
    { key: 'booth', icon: '📸', label: 'Booth' },
    { key: 'avatar', icon: '🎨', label: 'Avatar' }
  ];
  var currentTab = null;
  function renderMain() {
    var p = actingProfile();
    var isKid = role() === 'kid';
    var ptsLine = isKid ? '<div class="h-pts">' + p.pointsBalance + ' ⭐</div>' : '<div class="h-pts" style="color:var(--muted)">Parent</div>';
    $('app-header').innerHTML =
      '<div class="h-logo">⚡ OtakuChore</div>' +
      '<div class="h-right"><div class="h-user"><div class="h-av">' + avatarInner(p) + '</div>' +
        '<div><div class="h-name">' + esc(p.name) + '</div>' + ptsLine + '</div></div>' +
        '<span class="sync-ind hidden" id="sync-ind"></span>' +
        '<button class="icon-btn" onclick="UI.lock()">🔄 Switch</button></div>';
    var tabs = isKid ? KID_TABS : PARENT_TABS;
    $('app-tabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab" id="tab-' + t.key + '" onclick="UI.switchTab(\'' + t.key + '\')">' +
        '<span class="ti">' + t.icon + '</span>' + t.label +
        (t.key === 'approvals' ? '<span class="badge-dot hidden" id="approve-badge"></span>' : '') +
        '</button>';
    }).join('');
    updateApproveBadge();
    updateSyncInd();
  }
  function switchTab(key) {
    currentTab = key;
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function (t) { t.classList.remove('active'); });
    var active = $('tab-' + key); if (active) active.classList.add('active');
    var body = $('tab-body');
    if (window.Booth && Booth.stop) Booth.stop();
    if (key === 'chores') renderParentChores(body);
    else if (key === 'rewards') role() === 'kid' ? renderKidRewards(body) : renderParentRewards(body);
    else if (key === 'approvals') renderApprovals(body);
    else if (key === 'family') renderFamily(body);
    else if (key === 'home') renderKidHome(body);
    else if (key === 'booth') { body.innerHTML = '<div id="booth-root"></div>'; if (window.Booth) Booth.renderTab($('booth-root'), actingProfile().id); }
    else if (key === 'avatar') renderAvatarTab(body);
    body.scrollTop = 0;
  }
  function updateApproveBadge() {
    var el = $('approve-badge'); if (!el) return;
    var n = Engine.pendingCompletions().length + Engine.pendingRedemptions().length;
    if (n > 0) { el.textContent = n; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }
  function optionList(list, sel) {
    return list.map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === sel ? ' selected' : '') + '>' +
        (o.emoji ? o.emoji + ' ' : '') + o.label + '</option>';
    }).join('');
  }

  /* ============================================================
     PARENT — CHORES
     ============================================================ */
  function renderParentChores(body) {
    var chores = DB.chores();
    var html = '<div class="wrap">' +
      '<div class="sec-title">📋 Chores</div>' +
      '<button class="add-btn" onclick="UI.openChoreModal()">＋ Assign a Chore</button>';
    if (!chores.length) {
      html += emptyState('🧹', 'No chores yet', 'Add your own, or drop in a ready-made set.') +
        '<button class="btn-primary" onclick="UI.seedChores()">✨ Add 10 starter chores</button>';
    } else {
      Engine.ROUTINES.forEach(function (r) {
        var group = chores.filter(function (c) { return c.routine === r.value; });
        if (!group.length) return;
        html += '<div class="routine-group"><div class="routine-head"><span class="rh-emoji">' + r.emoji + '</span>' + r.label + '</div><div class="chore-list">';
        group.forEach(function (c) { html += parentChoreCard(c); });
        html += '</div></div>';
      });
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function parentChoreCard(c) {
    var cat = Engine.catInfo(c.category);
    var who = c.assignedProfileId ? (DB.profile(c.assignedProfileId) || {}).name : 'Anyone';
    var retired = c.active ? '' : ' <span class="muted">(done)</span>';
    return '<div class="chore-card">' +
      '<div class="chore-emoji-big">' + cat.emoji + '</div>' +
      '<div class="ci"><div class="ci-name">' + esc(c.title) + retired + '</div>' +
        (c.description ? '<div class="ci-desc">' + esc(c.description) + '</div>' : '') +
        '<div class="ci-meta">' +
          '<span class="pill pts">' + c.points + ' ⭐</span>' +
          '<span class="pill cat">' + cat.label + '</span>' +
          '<span class="pill cadence">' + (c.cadence === 'ONE_OFF' ? '1️⃣ One-off' : '🔁 Repeating') + '</span>' +
          '<span class="pill who">' + esc(who || 'Anyone') + '</span>' +
        '</div></div>' +
      '<div class="ca">' +
        '<button class="mini-act edit" onclick="UI.openChoreModal(\'' + c.id + '\')">✏️</button>' +
        '<button class="mini-act del" onclick="UI.deleteChore(\'' + c.id + '\')">🗑️</button>' +
      '</div></div>';
  }
  function seedChores() {
    var k = Engine.kids()[0];
    var n = Engine.seedStarterChores(k ? k.id : null);
    haptic(20); toast('Added ' + n + ' starter chores ✨'); switchTab('chores');
  }
  function openChoreModal(id) {
    var c = id ? DB.chore(id) : null;
    var kidOpts = '<option value="">👪 Anyone</option>' + Engine.kids().map(function (k) {
      return '<option value="' + k.id + '"' + (c && c.assignedProfileId === k.id ? ' selected' : '') + '>' + esc(k.avatar + ' ' + k.name) + '</option>';
    }).join('');
    var ptsOpts = Engine.POINT_CHOICES.map(function (p) {
      return '<option value="' + p + '"' + ((c ? c.points : 5) === p ? ' selected' : '') + '>' + p + ' ⭐</option>';
    }).join('');
    openModal(
      '<div class="modal-title">' + (c ? 'Edit Chore' : 'New Chore') + '</div>' +
      '<div style="text-align:left">' +
        '<div class="field"><label>What to do</label><input id="c-title" maxlength="40" value="' + esc(c ? c.title : '') + '" placeholder="e.g. Make your bed"></div>' +
        '<div class="field"><label>Note (optional)</label><input id="c-desc" maxlength="60" value="' + esc(c ? c.description : '') + '" placeholder="e.g. Don\'t forget the pillows"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>Points</label><select id="c-pts">' + ptsOpts + '</select></div>' +
          '<div class="field"><label>Category</label><select id="c-cat">' + optionList(Engine.CATEGORIES, c ? c.category : 'TASK') + '</select></div>' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field"><label>When</label><select id="c-rou">' + optionList(Engine.ROUTINES, c ? c.routine : 'ANYTIME') + '</select></div>' +
          '<div class="field"><label>Repeats?</label><select id="c-cad">' + optionList(Engine.CADENCE, c ? c.cadence : 'DAILY') + '</select></div>' +
        '</div>' +
        '<div class="field"><label>Who does it?</label><select id="c-who">' + kidOpts + '</select></div>' +
      '</div>' +
      '<div class="err" id="c-err"></div>' +
      '<button class="modal-confirm-btn" style="background:linear-gradient(135deg,var(--accent),#6d28d9)" onclick="UI.saveChore(' + (id ? '\'' + id + '\'' : 'null') + ')">' + (c ? 'Save' : 'Add Chore') + '</button>' +
      '<button class="modal-cancel-btn" onclick="UI.closeModal()">Cancel</button>'
    );
  }
  function saveChore(id) {
    var title = $('c-title').value.trim();
    if (!title) { $('c-err').textContent = 'Give the chore a name'; return; }
    var data = {
      title: title, description: $('c-desc').value.trim(),
      points: parseInt($('c-pts').value, 10), category: $('c-cat').value,
      routine: $('c-rou').value, cadence: $('c-cad').value,
      assignedProfileId: $('c-who').value || null
    };
    if (id) Engine.updateChore(id, data); else Engine.addChore(data);
    closeModal(); haptic(15); switchTab('chores');
  }
  function deleteChore(id) {
    var c = DB.chore(id); if (!c) return;
    confirmModal('Delete chore?', 'Remove <b style="color:var(--pink)">' + esc(c.title) + '</b> and any pending completions.', '🗑️ Delete', function () {
      Engine.deleteChore(id); haptic(20); switchTab('chores');
    });
  }

  /* ============================================================
     PARENT — REWARDS
     ============================================================ */
  function renderParentRewards(body) {
    var rewards = DB.rewards();
    var html = '<div class="wrap"><div class="sec-title">🎁 Rewards</div>' +
      '<button class="add-btn" onclick="UI.openRewardModal()">＋ Add a Reward</button>';
    if (!rewards.length) {
      html += emptyState('🎁', 'No rewards yet', 'Rewards kids can spend their stars on — experiences work best!') +
        '<button class="btn-primary" onclick="UI.seedRewards()">✨ Add starter rewards</button>';
    } else {
      html += '<div class="reward-grid">';
      rewards.forEach(function (r) {
        html += '<div class="reward-card"><div class="reward-emoji">🎁</div>' +
          '<div class="reward-title">' + esc(r.title) + '</div>' +
          (r.description ? '<div class="reward-desc">' + esc(r.description) + '</div>' : '') +
          '<div class="reward-cost">' + r.cost + ' ⭐</div>' +
          '<div style="display:flex;gap:6px">' +
            '<button class="reward-btn goal" style="flex:1" onclick="UI.openRewardModal(\'' + r.id + '\')">✏️ Edit</button>' +
            '<button class="reward-btn need" style="flex:0 0 auto;color:var(--red);border-color:var(--red)" onclick="UI.deleteReward(\'' + r.id + '\')">🗑️</button>' +
          '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function seedRewards() { var n = Engine.seedStarterRewards(); haptic(20); toast('Added ' + n + ' starter rewards ✨'); switchTab('rewards'); }
  function openRewardModal(id) {
    var r = id ? DB.reward(id) : null;
    openModal(
      '<div class="modal-title">' + (r ? 'Edit Reward' : 'New Reward') + '</div>' +
      '<div style="text-align:left">' +
        '<div class="field"><label>Reward</label><input id="r-title" maxlength="40" value="' + esc(r ? r.title : '') + '" placeholder="e.g. Movie night pick"></div>' +
        '<div class="field"><label>Note (optional)</label><input id="r-desc" maxlength="60" value="' + esc(r ? r.description : '') + '" placeholder="e.g. You choose the film"></div>' +
        '<div class="field"><label>Cost in stars</label><input id="r-cost" type="number" inputmode="numeric" min="1" value="' + (r ? r.cost : 50) + '"></div>' +
      '</div>' +
      '<div class="err" id="r-err"></div>' +
      '<button class="modal-confirm-btn" style="background:linear-gradient(135deg,var(--accent),#6d28d9)" onclick="UI.saveReward(' + (id ? '\'' + id + '\'' : 'null') + ')">' + (r ? 'Save' : 'Add Reward') + '</button>' +
      '<button class="modal-cancel-btn" onclick="UI.closeModal()">Cancel</button>'
    );
  }
  function saveReward(id) {
    var title = $('r-title').value.trim(), cost = parseInt($('r-cost').value, 10);
    if (!title) { $('r-err').textContent = 'Name the reward'; return; }
    if (!cost || cost < 1) { $('r-err').textContent = 'Cost must be at least 1 star'; return; }
    var data = { title: title, description: $('r-desc').value.trim(), cost: cost };
    if (id) Engine.updateReward(id, data); else Engine.addReward(data);
    closeModal(); haptic(15); switchTab('rewards');
  }
  function deleteReward(id) {
    var r = DB.reward(id); if (!r) return;
    confirmModal('Delete reward?', 'Remove <b style="color:var(--pink)">' + esc(r.title) + '</b>.', '🗑️ Delete', function () {
      Engine.deleteReward(id); haptic(20); switchTab('rewards');
    });
  }

  /* ============================================================
     PARENT — APPROVALS
     ============================================================ */
  function renderApprovals(body) {
    var comps = Engine.pendingCompletions();
    var reds = Engine.pendingRedemptions();
    var html = '<div class="wrap"><div class="sec-title">✅ Approvals</div>';
    if (!comps.length && !reds.length) {
      html += emptyState('🌟', 'All caught up!', 'When kids finish chores or ask for rewards, they show up here.');
    }
    if (comps.length) {
      html += '<div class="sec-sub">Chores waiting for your OK</div>';
      comps.forEach(function (c) {
        var chore = DB.chore(c.choreId), kid = DB.profile(c.profileId), cat = Engine.catInfo(chore.category);
        var mediaSlot = c.proofId ? '<div class="queue-media" id="pm-' + c.id + '"></div>' : '';
        html += '<div class="queue-card"><div class="queue-head"><div class="queue-emoji">' + cat.emoji + '</div>' +
          '<div class="queue-info"><div class="queue-title">' + esc(chore.title) + '</div>' +
            '<div class="queue-sub">' + esc(kid.name) + ' • ' + chore.points + ' ⭐ • ' + fmtTime(c.completedAt) + (c.proofId ? ' • 📸 proof' : '') + '</div></div></div>' +
          mediaSlot +
          '<div class="queue-actions"><button class="q-approve" onclick="UI.approveChore(\'' + c.id + '\')">✓ Approve</button>' +
          '<button class="q-reject" onclick="UI.rejectChore(\'' + c.id + '\')">✗ Not yet</button></div></div>';
      });
    }
    if (reds.length) {
      html += '<div class="sec-sub" style="margin-top:14px">Rewards kids want to buy</div>';
      reds.forEach(function (r) {
        var reward = DB.reward(r.rewardId), kid = DB.profile(r.profileId);
        var afford = kid.pointsBalance >= r.cost;
        html += '<div class="queue-card" style="border-color:var(--pink)"><div class="queue-head"><div class="queue-emoji">🎁</div>' +
          '<div class="queue-info"><div class="queue-title">' + esc(reward.title) + '</div>' +
            '<div class="queue-sub">' + esc(kid.name) + ' wants this • ' + r.cost + ' ⭐ • has ' + kid.pointsBalance + ' ⭐' +
            (afford ? '' : ' • <span style="color:var(--red)">not enough now</span>') + '</div></div></div>' +
          '<div class="queue-actions"><button class="q-approve" onclick="UI.approveReward(\'' + r.id + '\')">✓ Give it</button>' +
          '<button class="q-reject" onclick="UI.rejectReward(\'' + r.id + '\')">✗ Not yet</button></div></div>';
      });
    }
    // recent activity
    var acts = Engine.recentActivity(12);
    if (acts.length) {
      html += '<div class="sec-sub" style="margin-top:16px">Recent activity</div><div class="activity">';
      acts.forEach(function (a) {
        var up = a.entry.delta > 0;
        html += '<div class="act-row"><div class="act-av">' + esc(a.avatar) + '</div>' +
          '<div class="act-text">' + esc(a.name) + ' • ' + esc(a.entry.reason) + '<br><span class="muted">' + fmtTime(a.entry.createdAt) + '</span></div>' +
          '<div class="act-delta ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + a.entry.delta + ' ⭐</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
    // async-load proof media
    comps.forEach(function (c) { if (c.proofId) loadProofMedia('pm-' + c.id, c.proofId); });
  }
  function loadProofMedia(slotId, proofId) {
    if (!window.Media) return;
    var proof = DB.proofs().find(function (p) { return p.id === proofId; });
    if (!proof || !proof.mediaId) return;
    Media.get(proof.mediaId).then(function (url) {
      var slot = $(slotId); if (!slot || !url) return;
      slot.innerHTML = proof.type === 'video'
        ? '<video src="' + url + '" controls playsinline></video>'
        : '<img src="' + url + '" alt="proof">';
    }).catch(function () {});
  }
  function approveChore(cid) {
    var res = Engine.approveCompletion(cid);
    if (res) { celebrate('🎉', res.message); haptic(25); }
    updateApproveBadge(); switchTab('approvals');
  }
  function rejectChore(cid) { Engine.rejectCompletion(cid); haptic(15); updateApproveBadge(); switchTab('approvals'); }
  function approveReward(rid) {
    var res = Engine.approveRedemption(rid);
    if (res.ok) { celebrate('🎁', 'Enjoy your reward!'); haptic(25); }
    else if (res.reason === 'unaffordable') toast('Not enough stars right now — stays in the queue.');
    updateApproveBadge(); switchTab('approvals');
  }
  function rejectReward(rid) { Engine.rejectRedemption(rid); haptic(15); updateApproveBadge(); switchTab('approvals'); }

  /* ============================================================
     PARENT — FAMILY
     ============================================================ */
  function renderFamily(body) {
    var profiles = DB.profiles();
    var html = '<div class="wrap"><div class="sec-title">👨‍👩‍👧 Family</div>' +
      '<button class="add-btn" onclick="UI.openProfileModal()">＋ Add a family member</button>';
    profiles.forEach(function (p) {
      var meta = [];
      if (p.role === 'CHILD') {
        var b = Engine.badgeFor(Engine.lifetimeEarned(p.id));
        meta.push(p.pointsBalance + ' ⭐');
        meta.push('🔥 ' + Engine.streakFor(p.id));
        if (b) meta.push(b.emoji + ' ' + b.label);
      } else meta.push('Parent');
      if (p.pin) meta.push('🔒 PIN');
      html += '<div class="profile-row"><div class="pr-av">' + avatarInner(p) + '</div>' +
        '<div class="pr-info"><div class="pr-name">' + esc(p.name) + '</div>' +
          '<div class="pr-meta">' + meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('<span>·</span>') + '</div></div>' +
        '<div class="pr-actions">' +
          '<button class="mini-act edit" onclick="UI.openProfileModal(\'' + p.id + '\')">✏️</button>' +
          (profiles.length > 1 ? '<button class="mini-act del" onclick="UI.deleteProfile(\'' + p.id + '\')">🗑️</button>' : '') +
        '</div></div>';
    });
    html += '<div class="tip">💡 Tip: rewards work best as experiences (movie night, a day out) rather than money — and approving chores yourself keeps the encouragement personal.</div>';
    html += renderSyncSection();
    html += '<div style="margin-top:16px;display:flex;gap:8px">' +
      '<button class="btn-ghost" style="margin:0" onclick="UI.exportData()">⬇️ Backup data</button>' +
      '<button class="btn-ghost" style="margin:0;border-color:var(--red);color:var(--red)" onclick="UI.resetApp()">Reset app</button></div>';
    html += '</div>';
    body.innerHTML = html;
  }
  function openProfileModal(id) {
    var p = id ? DB.profile(id) : null;
    var emojiChips = Engine.AVATAR_EMOJIS.map(function (e) {
      return '<button type="button" class="chip' + ((p ? p.avatar : '🦊') === e ? ' active' : '') + '" data-emoji="' + e + '" onclick="UI.pickProfileAvatar(this)">' + e + '</button>';
    }).join('');
    openModal(
      '<div class="modal-title">' + (p ? 'Edit Member' : 'Add Member') + '</div>' +
      '<div style="text-align:left">' +
        '<div class="field"><label>Name</label><input id="p-name" maxlength="20" value="' + esc(p ? p.name : '') + '" placeholder="e.g. Ariya"></div>' +
        '<div class="field"><label>Role</label><select id="p-role">' +
          '<option value="CHILD"' + (p && p.role === 'CHILD' ? ' selected' : '') + '>🧒 Kid</option>' +
          '<option value="PARENT"' + (p && p.role === 'PARENT' ? ' selected' : '') + '>👑 Parent</option></select></div>' +
        '<div class="field"><label>Avatar' + (p && p.avatarCfg ? ' (custom avatar in use — pick an emoji to replace)' : '') + '</label><div class="chip-grid" id="p-avatars" style="max-height:120px;overflow-y:auto">' + emojiChips + '</div></div>' +
        '<div class="field"><label>PIN (4 digits, optional)</label><input id="p-pin" type="password" inputmode="numeric" maxlength="4" value="' + esc(p && p.pin ? p.pin : '') + '" placeholder="Leave blank for no lock"></div>' +
      '</div>' +
      '<div class="err" id="p-err"></div>' +
      '<button class="modal-confirm-btn" style="background:linear-gradient(135deg,var(--accent),#6d28d9)" onclick="UI.saveProfile(' + (id ? '\'' + id + '\'' : 'null') + ')">' + (p ? 'Save' : 'Add') + '</button>' +
      '<button class="modal-cancel-btn" onclick="UI.closeModal()">Cancel</button>'
    );
    $('modal')._pav = p ? p.avatar : '🦊';
  }
  function pickProfileAvatar(btn) {
    Array.prototype.forEach.call($('p-avatars').children, function (c) { c.classList.remove('active'); });
    btn.classList.add('active');
    $('modal')._pav = btn.getAttribute('data-emoji');
  }
  function saveProfile(id) {
    var name = $('p-name').value.trim(), pin = $('p-pin').value.trim(), av = $('modal')._pav;
    if (!name) { $('p-err').textContent = 'Enter a name'; return; }
    if (pin && !/^\d{4}$/.test(pin)) { $('p-err').textContent = 'PIN must be 4 digits'; return; }
    var patch = { name: name, avatar: av, role: $('p-role').value, pin: pin || null };
    // if replacing emoji avatar, clear any custom avatarCfg so the emoji shows
    if (id) {
      var existing = DB.profile(id);
      if (existing && existing.avatar !== av) patch.avatarCfg = null;
      Engine.updateProfile(id, patch);
      closeModal(); haptic(15); switchTab('family');
    } else {
      var np = Engine.addProfile(patch);
      closeModal(); haptic(20);
      showSuccess(np.name); // cat welcome for the new member
    }
  }
  function deleteProfile(id) {
    var p = DB.profile(id); if (!p) return;
    confirmModal('Remove ' + p.name + '?', 'This removes <b style="color:var(--pink)">' + esc(p.name) + '</b> and their points. Chores stay (unassigned).', '🗑️ Remove', function () {
      Engine.deleteProfile(id);
      if (mode().profileId === id) { lock(); }
      else { haptic(20); switchTab('family'); }
    });
  }

  /* ============================================================
     SUCCESS — anime cat welcome (after adding a member)
     ============================================================ */
  function showSuccess(name) {
    $('screen-success').innerHTML =
      '<div class="success-top">' +
        '<div class="success-title">🎉 WELCOME! 🎉</div>' +
        '<div class="muted">' + esc(name) + ' has joined the family</div>' +
        '<div class="spacer"></div>' +
        '<div class="speech-bubble">Ready to earn some stars? ✨<br><span style="font-size:11px;color:var(--accent)">Let\'s go questing! ⚡</span></div>' +
      '</div>' +
      catMarkup() +
      '<div style="padding:14px 16px 18px;width:100%;max-width:400px;margin:0 auto">' +
        '<button class="btn-primary" onclick="UI.route()">▶ Continue</button></div>';
    showScreen('screen-success');
    haptic([12, 30, 12]);
  }
  function catMarkup() {
    return '<div class="cat-scene"><div class="cat-body-wrap"><div class="cat-container">' +
      '<div class="cat-tail"></div>' +
      '<div class="cat-body"><div class="cat-stripe-body s1"></div><div class="cat-stripe-body s2"></div><div class="cat-stripe-body s3"></div></div>' +
      '<div class="cat-head"><div class="cat-ear left"></div><div class="cat-ear right"></div>' +
        '<div class="cat-stripe-head h1"></div><div class="cat-stripe-head h2"></div><div class="cat-stripe-head h3"></div><div class="cat-stripe-head h4"></div>' +
        '<div class="cat-eyes"><div class="cat-eye" style="--d:0s"><div class="cat-eye-shine"></div></div><div class="cat-eye" style="--d:.1s"><div class="cat-eye-shine"></div></div></div>' +
        '<div class="cat-nose"></div><div class="cat-mouth"></div>' +
        '<div class="whisker wl1"></div><div class="whisker wl2"></div><div class="whisker wr1"></div><div class="whisker wr2"></div>' +
      '</div></div></div><div class="counter"></div></div>';
  }

  /* ============================================================
     KID — HOME (quests)
     ============================================================ */
  function renderKidHome(body) {
    var p = actingProfile();
    var streak = Engine.streakFor(p.id), badge = Engine.badgeFor(Engine.lifetimeEarned(p.id));
    var html = '<div class="wrap">' +
      '<div class="hero"><div class="hero-av">' + avatarInner(p) + '</div>' +
        '<div class="hero-info"><div class="hero-name">' + esc(p.name) + '</div>' +
          '<div class="hero-chips">' +
            '<span class="chip-stat pts">⭐ ' + p.pointsBalance + '</span>' +
            '<span class="chip-stat streak">🔥 ' + streak + ' day' + (streak === 1 ? '' : 's') + '</span>' +
            (badge ? '<span class="chip-stat badge">' + badge.emoji + ' ' + badge.label + '</span>' : '') +
          '</div></div></div>';
    // savings goal
    var goal = Engine.goalProgress(p);
    if (goal) {
      html += '<div class="goal-box"><div class="goal-top"><div class="goal-title">🎯 Saving for: ' + esc(goal.reward.title) + '</div>' +
        '<div class="goal-remain">' + (goal.enough ? 'Ready! 🎉' : goal.remaining + ' ⭐ to go') + '</div></div>' +
        '<div class="bar"><div class="bar-fill" style="width:' + Math.round(goal.frac * 100) + '%"></div></div></div>';
    }
    var chores = Engine.choresForKid(p.id);
    if (!chores.length) {
      html += emptyState('🌸', 'No quests yet', 'Ask a parent to add some chores!');
    } else {
      Engine.ROUTINES.forEach(function (r) {
        var group = chores.filter(function (c) { return c.routine === r.value; });
        if (!group.length) return;
        html += '<div class="routine-group"><div class="routine-head"><span class="rh-emoji">' + r.emoji + '</span>' + r.label + '</div><div class="chore-list">';
        group.forEach(function (c) { html += kidChoreCard(c, p.id); });
        html += '</div></div>';
      });
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function kidChoreCard(c, kidId) {
    var cat = Engine.catInfo(c.category);
    var st = Engine.choreStateForKid(c, kidId);
    var action;
    if (st.state === 'done') action = '<span class="done-badge">✓ Done!</span>';
    else if (st.state === 'pending') action = '<button class="mini-act wait" disabled>Sent ⏳</button>';
    else action = '<button class="mini-act go" onclick="UI.doChore(\'' + c.id + '\')">I did it ✅</button>' +
      '<button class="mini-act proof" onclick="UI.proofFor(\'' + c.id + '\')">📸</button>';
    return '<div class="chore-card' + (st.state === 'done' ? ' done' : st.state === 'pending' ? ' pending' : '') + '">' +
      '<div class="chore-emoji-big">' + cat.emoji + '</div>' +
      '<div class="ci"><div class="ci-name">' + esc(c.title) + '</div>' +
        (c.description ? '<div class="ci-desc">' + esc(c.description) + '</div>' : '') +
        '<div class="ci-meta"><span class="pill pts">' + c.points + ' ⭐</span>' +
          '<button class="mini-act chat" style="padding:2px 9px" onclick="UI.openChat(\'' + c.id + '\')">💬 Chat</button></div></div>' +
      '<div class="ca">' + action + '</div></div>';
  }
  function doChore(choreId) {
    var p = actingProfile();
    Engine.completeChore(choreId, p.id);
    haptic(15); celebrate('✅', 'Sent to a parent!'); switchTab('home');
  }
  function proofFor(choreId) {
    if (window.Booth) Booth.setTarget(choreId);
    switchTab('booth');
  }

  /* ============================================================
     KID — REWARDS
     ============================================================ */
  function renderKidRewards(body) {
    var p = actingProfile();
    var rewards = DB.rewards().filter(function (r) { return r.active; });
    var myPending = DB.redemptions().filter(function (r) { return r.profileId === p.id && r.status === 'PENDING'; });
    var pendingIds = {}; myPending.forEach(function (r) { pendingIds[r.rewardId] = true; });
    var html = '<div class="wrap"><div class="sec-title">🎁 Reward Store</div>' +
      '<div class="sec-sub">You have <b style="color:var(--gold)">' + p.pointsBalance + ' ⭐</b></div>';
    if (!rewards.length) { html += emptyState('🎁', 'No rewards yet', 'Ask a parent to add some!'); }
    else {
      html += '<div class="reward-grid">';
      rewards.forEach(function (r) {
        var afford = p.pointsBalance >= r.cost;
        var isGoal = p.goalRewardId === r.id;
        var btn;
        if (pendingIds[r.id]) btn = '<button class="reward-btn pending" disabled>Requested ⏳</button>';
        else if (afford) btn = '<button class="reward-btn get" onclick="UI.redeem(\'' + r.id + '\')">Get it 🎉</button>';
        else btn = '<button class="reward-btn need" disabled>' + (r.cost - p.pointsBalance) + ' ⭐ to go</button>';
        html += '<div class="reward-card' + (afford ? '' : ' locked') + '"><div class="reward-emoji">🎁</div>' +
          '<div class="reward-title">' + esc(r.title) + '</div>' +
          (r.description ? '<div class="reward-desc">' + esc(r.description) + '</div>' : '') +
          '<div class="reward-cost">' + r.cost + ' ⭐</div>' + btn +
          '<button class="reward-btn goal" onclick="UI.toggleGoal(\'' + r.id + '\')">' + (isGoal ? '★ Goal' : '☆ Set goal') + '</button>' +
          '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function redeem(rewardId) {
    var p = actingProfile();
    var res = Engine.requestRedemption(rewardId, p.id);
    if (res) { haptic(15); celebrate('🎁', 'Asked a parent!'); }
    else toast('Not enough stars yet!');
    switchTab('rewards');
  }
  function toggleGoal(rewardId) {
    var p = actingProfile();
    Engine.setGoal(p.id, p.goalRewardId === rewardId ? null : rewardId);
    haptic(12); switchTab('rewards');
  }

  /* ============================================================
     KID — AVATAR
     ============================================================ */
  function renderAvatarTab(body) {
    body.innerHTML = '<div class="wrap"><div class="sec-title">🎨 Make Your Avatar</div><div id="avatar-root"></div></div>';
    var p = actingProfile();
    if (!window.CTAvatar) { $('avatar-root').innerHTML = '<div class="muted">Avatar creator unavailable.</div>'; return; }
    CTAvatar.render($('avatar-root'), p.avatarCfg, {
      onSave: function (cfg, svg) {
        Engine.updateProfile(p.id, { avatarCfg: cfg });
        haptic(20); toast('Avatar saved! ✨');
        // refresh header avatar
        renderMain(); var t = $('tab-avatar'); if (t) t.classList.add('active');
      }
    });
  }

  /* ============================================================
     CHAT bridge
     ============================================================ */
  function openChat(choreId) { if (window.Chat) Chat.open(choreId); }

  /* ============================================================
     settings: export / reset
     ============================================================ */
  function exportData() {
    var data = JSON.stringify(DB.exportAll(), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'otakuchore-backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Backup downloaded ⬇️');
  }
  function resetApp() {
    confirmModal('Reset everything?', 'This erases ALL family data on this device — profiles, chores, points, everything. Cannot be undone.', '⚠️ Erase all', function () {
      DB.wipe(); if (window.Media) Media.clear();
      DB.setMode({ role: 'locked', profileId: null });
      route();
    });
  }

  /* ============================================================
     SYNC & DEVICES (v2)
     ============================================================ */
  function syncStatusMeta(st) {
    switch (st) {
      case 'synced':   return { cls: 'ok',   label: 'Synced' };
      case 'syncing':  return { cls: 'busy', label: 'Syncing…' };
      case 'offline':  return { cls: 'off',  label: 'Offline — will sync when back online' };
      case 'error':    return { cls: 'err',  label: 'Sync problem' };
      case 'unlinked': return { cls: 'idle', label: 'Not synced' };
      default:         return { cls: 'idle', label: '' };
    }
  }
  function updateSyncInd() {
    var el = $('sync-ind'); if (!el) return;
    if (!window.Sync || !Sync.enabled()) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    var m = syncStatusMeta(Sync.status());
    el.className = 'sync-ind ' + m.cls;
    el.title = m.label;
  }
  function onSyncStatus() { updateSyncInd(); }
  function onSyncUpdate() {
    // remote changes arrived — re-render the current view, guarding a remotely-deleted profile
    if ($('main-screen').classList.contains('active')) {
      if (!actingProfile()) { lock(); return; }
      renderMain();
      switchTab(currentTab || (role() === 'parent' ? 'chores' : 'home'));
    } else if ($('screen-hub').classList.contains('active')) {
      renderHub();
    }
  }
  function renderSyncSection() {
    if (!window.Sync || !Sync.enabled()) return '';
    var linked = Sync.isLinked();
    var html = '<div class="sync-card"><div class="sync-head">☁️ Sync &amp; Devices</div>';
    if (linked) {
      html += '<div class="muted" style="margin-bottom:10px">This family syncs across devices — changes show up everywhere within a few seconds. Kids\' photos stay on each device.</div>' +
        '<button class="btn-primary" onclick="UI.syncAddDevice()">➕ Add a device</button>' +
        '<button class="btn-ghost" onclick="UI.syncUnlink()">Unlink this device</button>';
    } else {
      html += '<div class="muted" style="margin-bottom:10px">Share this family across phones &amp; tablets. Data only — kids\' selfie proofs never leave the device.</div>' +
        '<button class="btn-primary" onclick="UI.syncCreate()">☁️ Sync this family to the cloud</button>' +
        '<button class="btn-ghost" onclick="UI.syncJoinPrompt()">📲 Join a family on this device</button>';
    }
    return html + '</div>';
  }
  function syncCreate() {
    UI.toast('Setting up sync…');
    Sync.createFamily().then(function () { UI.toast('Synced! Tap "Add a device" on your other phone/tablet.'); switchTab('family'); })
      .catch(function () { UI.toast('Could not reach the sync server.'); });
  }
  function syncAddDevice() {
    Sync.startPairing().then(function (d) { showPairingCode(d.code, d.ttl); })
      .catch(function () { UI.toast('Could not create a code — check your connection.'); });
  }
  var _pairTimer = null;
  function showPairingCode(code, ttl) {
    var pretty = code.slice(0, 4) + ' ' + code.slice(4);
    openModal(
      '<div class="modal-title">Add a device</div>' +
      '<div class="modal-sub">On the OTHER device: open OtakuChore → <b>Family</b> → <b>Join a family</b>, and type this code.</div>' +
      '<div class="pair-code">' + esc(pretty) + '</div>' +
      '<div class="muted" id="pair-count" style="margin-bottom:12px"></div>' +
      '<button class="modal-confirm-btn" style="background:linear-gradient(135deg,var(--accent),#6d28d9)" onclick="UI.copyText(\'' + code + '\')">📋 Copy code</button>' +
      '<button class="modal-cancel-btn" onclick="UI.closeModal()">Done</button>'
    );
    var end = Date.now() + (ttl || 600) * 1000;
    if (_pairTimer) clearInterval(_pairTimer);
    _pairTimer = setInterval(function () {
      var el = $('pair-count'); if (!el) { clearInterval(_pairTimer); _pairTimer = null; return; }
      var left = Math.max(0, Math.round((end - Date.now()) / 1000));
      el.textContent = left > 0 ? ('Expires in ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2)) : 'Code expired — tap Add a device again';
      if (left <= 0) { clearInterval(_pairTimer); _pairTimer = null; }
    }, 1000);
  }
  function syncJoinPrompt() {
    openModal(
      '<div class="modal-title">Join a family</div>' +
      '<div class="modal-sub">Enter the code shown on your other device (Family → Add a device).</div>' +
      '<input id="join-code" maxlength="9" placeholder="ABCD EFGH" autocapitalize="characters" style="text-align:center;font-size:20px;letter-spacing:3px;text-transform:uppercase">' +
      '<div class="err" id="join-err"></div>' +
      '<button class="modal-confirm-btn" style="background:linear-gradient(135deg,var(--accent),#6d28d9)" onclick="UI.syncJoin()">Join &amp; sync</button>' +
      '<button class="modal-cancel-btn" onclick="UI.closeModal()">Cancel</button>'
    );
  }
  function syncJoin() {
    var code = ($('join-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 8) { $('join-err').textContent = 'Enter the 8-character code'; return; }
    $('join-err').textContent = 'Joining…';
    Sync.redeemCode(code).then(function () { closeModal(); UI.toast('Joined! This device is now synced.'); route(); })
      .catch(function () { $('join-err').textContent = 'That code did not work (expired or mistyped).'; });
  }
  function syncUnlink() {
    confirmModal('Unlink this device?', 'This device stops syncing. The family data stays here, but changes won\'t travel to or from other devices.', 'Unlink', function () {
      Sync.leave(); UI.toast('Unlinked from sync.'); switchTab('family');
    });
  }
  function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text); UI.toast('Code copied 📋'); return; } } catch (e) {}
    UI.toast('Code: ' + text);
  }

  /* ---------------- shared bits ---------------- */
  function emptyState(emoji, title, sub) {
    return '<div class="empty-state"><span class="ei">' + emoji + '</span><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p></div>';
  }

  /* ---------------- export ---------------- */
  window.UI = {
    route: route, showScreen: showScreen, closeModal: closeModal, celebrate: celebrate, toast: toast, haptic: haptic,
    // welcome
    renderWelcome: renderWelcome, pickWelcomeAvatar: pickWelcomeAvatar, submitWelcome: submitWelcome,
    // hub / entry
    renderHub: renderHub, enterProfile: enterProfile, lock: lock, entryKey: entryKey,
    // main
    switchTab: switchTab, updateApproveBadge: updateApproveBadge,
    // parent chores
    openChoreModal: openChoreModal, saveChore: saveChore, deleteChore: deleteChore, seedChores: seedChores,
    // parent rewards
    openRewardModal: openRewardModal, saveReward: saveReward, deleteReward: deleteReward, seedRewards: seedRewards,
    // approvals
    approveChore: approveChore, rejectChore: rejectChore, approveReward: approveReward, rejectReward: rejectReward,
    // family
    openProfileModal: openProfileModal, pickProfileAvatar: pickProfileAvatar, saveProfile: saveProfile, deleteProfile: deleteProfile,
    // kid
    doChore: doChore, proofFor: proofFor, redeem: redeem, toggleGoal: toggleGoal,
    // chat + settings
    openChat: openChat, exportData: exportData, resetApp: resetApp,
    // sync (v2)
    onSyncStatus: onSyncStatus, onSyncUpdate: onSyncUpdate,
    syncCreate: syncCreate, syncAddDevice: syncAddDevice, syncJoinPrompt: syncJoinPrompt, syncJoin: syncJoin, syncUnlink: syncUnlink, copyText: copyText,
    // for booth to refresh after send
    refreshTab: function () { if (currentTab) switchTab(currentTab); }
  };
})();
