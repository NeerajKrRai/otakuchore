/* ============================================================
   engine.js — business logic (ported from the Expo/Amplify app).
   All writes go through DB.upsert / DB.remove so every change is
   stamped (updatedAt) and deletes are tombstones — making the data
   safe to merge across devices. Depends on: window.DB
   Exposes: window.Engine
   ============================================================ */
(function () {
  'use strict';
  var DB = window.DB;

  /* ---------------- constants (verbatim from source app) ---------------- */
  var CATEGORIES = [
    { value: 'TASK',     label: 'Task',     emoji: '🧹' },
    { value: 'MANNERS',  label: 'Manners',  emoji: '🙏' },
    { value: 'HEALTHY',  label: 'Healthy',  emoji: '🥦' },
    { value: 'KINDNESS', label: 'Kindness', emoji: '💛' },
    { value: 'LEARNING', label: 'Learning', emoji: '📚' }
  ];
  var ROUTINES = [
    { value: 'MORNING', label: 'Morning', emoji: '🌅' },
    { value: 'ANYTIME', label: 'Anytime', emoji: '⭐' },
    { value: 'BEDTIME', label: 'Bedtime', emoji: '🌙' }
  ];
  var CADENCE = [
    { value: 'DAILY',   label: 'Repeating', emoji: '🔁' },
    { value: 'ONE_OFF', label: 'One-off',   emoji: '1️⃣' }
  ];
  var PRAISE = {
    TASK: 'Great responsibility!', MANNERS: 'Lovely manners!',
    HEALTHY: 'Healthy habit!', KINDNESS: 'So kind! 💛', LEARNING: 'Great learning!'
  };
  var POINT_CHOICES = [5, 10, 15, 20, 25, 30, 50];
  var AVATAR_EMOJIS = ['🦊','🐱','🐶','🐼','🦄','🐯','🐸','🐵','🐧','🐰','🦁','🐨','🐤','🐢','🌸','⚡','🎌','⭐','🌙','👑','🔥'];

  var STARTER_CHORES = [
    { title: 'Make your bed',            category: 'TASK',     routine: 'MORNING', points: 5 },
    { title: 'Brush your teeth',         category: 'HEALTHY',  routine: 'MORNING', points: 5 },
    { title: 'Get dressed on your own',  category: 'TASK',     routine: 'MORNING', points: 5 },
    { title: 'Say please & thank you',   category: 'MANNERS',  routine: 'ANYTIME', points: 5 },
    { title: 'Help a sibling or friend', category: 'KINDNESS', routine: 'ANYTIME', points: 10 },
    { title: 'Tidy up your toys',        category: 'TASK',     routine: 'ANYTIME', points: 5 },
    { title: '15 minutes of reading',    category: 'LEARNING', routine: 'ANYTIME', points: 10 },
    { title: 'Pack your school bag',     category: 'TASK',     routine: 'BEDTIME', points: 5 },
    { title: 'Brush your teeth',         category: 'HEALTHY',  routine: 'BEDTIME', points: 5 },
    { title: 'Tidy your room',           category: 'TASK',     routine: 'BEDTIME', points: 5 }
  ];
  var STARTER_REWARDS = [
    { title: 'Extra bedtime story',    cost: 20 },
    { title: "Pick tonight's dinner",  cost: 40 },
    { title: 'Movie night pick',       cost: 50 },
    { title: 'Stay up 30 mins later',  cost: 60 },
    { title: 'A special day out',      cost: 200 }
  ];
  var BADGES = [
    { min: 500, emoji: '👑', label: 'Champion' },
    { min: 250, emoji: '🏆', label: 'Superstar' },
    { min: 100, emoji: '🥇', label: 'Pro' },
    { min: 50,  emoji: '🌟', label: 'Rising star' }
  ];

  /* ---------------- lookups ---------------- */
  function byValue(list, v) { for (var i = 0; i < list.length; i++) if (list[i].value === v) return list[i]; return list[0]; }
  function catInfo(v) { return byValue(CATEGORIES, v); }
  function routineInfo(v) { return byValue(ROUTINES, v); }
  function cadenceLabel(v) { return v === 'ONE_OFF' ? 'One-off' : 'Repeating'; }
  function dayKey(iso) { var d = new Date(iso); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  /* ---------------- stats ---------------- */
  function computeStreak(timestamps) {
    if (!timestamps || !timestamps.length) return 0;
    var set = {};
    timestamps.forEach(function (t) { set[dayKey(t)] = true; });
    var cursor = new Date();
    if (!set[todayKey()]) cursor.setDate(cursor.getDate() - 1);
    var streak = 0;
    while (true) {
      var k = cursor.getFullYear() + '-' + cursor.getMonth() + '-' + cursor.getDate();
      if (set[k]) { streak++; cursor.setDate(cursor.getDate() - 1); } else break;
    }
    return streak;
  }
  function badgeFor(lifetimeEarned) { for (var i = 0; i < BADGES.length; i++) if (lifetimeEarned >= BADGES[i].min) return BADGES[i]; return null; }
  function lifetimeEarned(profileId) {
    return DB.ledger().reduce(function (s, e) { return (e.profileId === profileId && e.delta > 0) ? s + e.delta : s; }, 0);
  }
  function streakFor(profileId) {
    return computeStreak(DB.ledger().filter(function (e) { return e.profileId === profileId && e.delta > 0; }).map(function (e) { return e.createdAt; }));
  }

  /* ---------------- ledger ---------------- */
  function addLedger(profileId, delta, reason, refType, refId) {
    DB.upsert('ledger', { id: DB.uuid(), profileId: profileId, delta: delta, reason: reason, refType: refType, refId: refId, createdAt: DB.now() });
  }

  /* ---------------- family / profiles ---------------- */
  function createFamily(familyName, parent) {
    DB.setFamily({ name: familyName, createdAt: DB.now() });
    return addProfile({ name: parent.name || 'Parent', role: 'PARENT', avatar: parent.avatar || '👑', avatarCfg: parent.avatarCfg || null, pin: parent.pin || null });
  }
  function addProfile(data) {
    return DB.upsert('profiles', {
      id: DB.uuid(), name: data.name, role: data.role === 'PARENT' ? 'PARENT' : 'CHILD',
      avatar: data.avatar || '🦊', avatarCfg: data.avatarCfg || null, pin: data.pin || null,
      pointsBalance: 0, goalRewardId: null, createdAt: DB.now()
    });
  }
  function updateProfile(id, patch) {
    var p = DB.profile(id); if (!p) return null;
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    return DB.upsert('profiles', p);
  }
  function deleteProfile(id) {
    DB.completions().forEach(function (c) { if (c.profileId === id && c.status === 'PENDING') DB.remove('completions', c.id); });
    DB.redemptions().forEach(function (r) { if (r.profileId === id && r.status === 'PENDING') DB.remove('redemptions', r.id); });
    DB.chores().forEach(function (c) { if (c.assignedProfileId === id) { c.assignedProfileId = null; DB.upsert('chores', c); } });
    DB.ledger().forEach(function (e) { if (e.profileId === id) DB.remove('ledger', e.id); });
    DB.remove('profiles', id);
  }
  function kids() { return DB.profiles().filter(function (p) { return p.role === 'CHILD'; }); }
  function parents() { return DB.profiles().filter(function (p) { return p.role === 'PARENT'; }); }
  function hasParentPin() { return parents().some(function (p) { return !!p.pin; }); }

  /* ---------------- chores ---------------- */
  function addChore(data) {
    return DB.upsert('chores', {
      id: DB.uuid(), title: data.title, description: data.description || '', points: data.points || 5,
      cadence: data.cadence === 'ONE_OFF' ? 'ONE_OFF' : 'DAILY', category: data.category || 'TASK',
      routine: data.routine || 'ANYTIME', assignedProfileId: data.assignedProfileId || null, active: true, createdAt: DB.now()
    });
  }
  function updateChore(id, patch) {
    var c = DB.chore(id); if (!c) return null;
    Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
    return DB.upsert('chores', c);
  }
  function deleteChore(id) {
    var mediaIds = DB.proofs().filter(function (p) { return p.choreId === id && p.mediaId; }).map(function (p) { return p.mediaId; });
    DB.completions().forEach(function (c) { if (c.choreId === id) DB.remove('completions', c.id); });
    DB.proofs().forEach(function (p) { if (p.choreId === id) DB.remove('proofs', p.id); });
    DB.messages().forEach(function (m) { if (m.choreId === id) DB.remove('messages', m.id); });
    DB.remove('chores', id);
    if (window.Media && mediaIds.length) window.Media.remove(mediaIds);
  }
  function seedStarterChores(assignToProfileId) {
    if (DB.chores().length) return 0;
    STARTER_CHORES.forEach(function (s) {
      DB.upsert('chores', { id: DB.uuid(), title: s.title, description: '', points: s.points, cadence: 'DAILY', category: s.category, routine: s.routine, assignedProfileId: assignToProfileId || null, active: true, createdAt: DB.now() });
    });
    var seeded = DB.seeded(); seeded.chores = true; DB.setSeeded(seeded);
    return STARTER_CHORES.length;
  }
  function completionsFor(choreId, profileId) {
    return DB.completions().filter(function (c) { return c.choreId === choreId && c.profileId === profileId; });
  }
  function choreStateForKid(chore, profileId) {
    var today = todayKey(), mine = completionsFor(chore.id, profileId);
    var pending = mine.find(function (c) { return c.status === 'PENDING'; });
    if (pending) return { state: 'pending', completion: pending };
    var doneToday = mine.find(function (c) { return c.status === 'APPROVED' && c.approvedAt && dayKey(c.approvedAt) === today; });
    if (doneToday) return { state: 'done', completion: doneToday };
    return { state: 'available', completion: null };
  }
  function choresForKid(profileId) {
    return DB.chores().filter(function (c) { return c.active && (c.assignedProfileId === profileId || c.assignedProfileId == null); });
  }

  /* ---------------- completion (approval) flow ---------------- */
  function completeChore(choreId, profileId, proofId) {
    var existing = completionsFor(choreId, profileId).find(function (c) { return c.status === 'PENDING'; });
    if (existing) return existing;
    return DB.upsert('completions', {
      id: DB.uuid(), choreId: choreId, profileId: profileId, status: 'PENDING',
      pointsAwarded: null, completedAt: DB.now(), approvedAt: null, proofId: proofId || null
    });
  }
  function approveCompletion(completionId) {
    var comp = DB.find('completions', completionId);
    if (!comp || comp.status !== 'PENDING') return null;
    var chore = DB.chore(comp.choreId), profile = DB.profile(comp.profileId);
    if (!chore || !profile) { comp.status = 'REJECTED'; comp.approvedAt = DB.now(); DB.upsert('completions', comp); return null; }
    var pts = chore.points;
    updateProfile(profile.id, { pointsBalance: profile.pointsBalance + pts });
    addLedger(profile.id, +pts, chore.title, 'CHORE', comp.id);
    comp.status = 'APPROVED'; comp.pointsAwarded = pts; comp.approvedAt = DB.now();
    DB.upsert('completions', comp);
    if (chore.cadence === 'ONE_OFF') updateChore(chore.id, { active: false });
    return { profile: DB.profile(profile.id), points: pts, category: chore.category, message: (PRAISE[chore.category] || 'Nice work!') + ' +' + pts + ' ⭐' };
  }
  function rejectCompletion(completionId) {
    var comp = DB.find('completions', completionId);
    if (!comp || comp.status !== 'PENDING') return null;
    comp.status = 'REJECTED'; comp.approvedAt = DB.now();
    return DB.upsert('completions', comp);
  }
  function pendingCompletions() {
    return DB.completions().filter(function (c) { return c.status === 'PENDING' && DB.chore(c.choreId) && DB.profile(c.profileId); });
  }

  /* ---------------- rewards economy ---------------- */
  function addReward(data) {
    return DB.upsert('rewards', { id: DB.uuid(), title: data.title, description: data.description || '', cost: data.cost || 10, active: true, createdAt: DB.now() });
  }
  function updateReward(id, patch) {
    var r = DB.reward(id); if (!r) return null;
    Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
    return DB.upsert('rewards', r);
  }
  function deleteReward(id) {
    DB.redemptions().forEach(function (r) { if (r.rewardId === id && r.status === 'PENDING') DB.remove('redemptions', r.id); });
    DB.profiles().forEach(function (p) { if (p.goalRewardId === id) { p.goalRewardId = null; DB.upsert('profiles', p); } });
    DB.remove('rewards', id);
  }
  function seedStarterRewards() {
    if (DB.rewards().length) return 0;
    STARTER_REWARDS.forEach(function (s) { DB.upsert('rewards', { id: DB.uuid(), title: s.title, description: '', cost: s.cost, active: true, createdAt: DB.now() }); });
    var seeded = DB.seeded(); seeded.rewards = true; DB.setSeeded(seeded);
    return STARTER_REWARDS.length;
  }
  function requestRedemption(rewardId, profileId) {
    var reward = DB.reward(rewardId), profile = DB.profile(profileId);
    if (!reward || !profile) return null;
    if (profile.pointsBalance < reward.cost) return null;
    var dup = DB.redemptions().find(function (r) { return r.rewardId === rewardId && r.profileId === profileId && r.status === 'PENDING'; });
    if (dup) return dup;
    return DB.upsert('redemptions', { id: DB.uuid(), rewardId: rewardId, profileId: profileId, cost: reward.cost, status: 'PENDING', requestedAt: DB.now(), resolvedAt: null });
  }
  function approveRedemption(redemptionId) {
    var red = DB.find('redemptions', redemptionId);
    if (!red || red.status !== 'PENDING') return { ok: false };
    var profile = DB.profile(red.profileId), reward = DB.reward(red.rewardId);
    if (!profile) { red.status = 'REJECTED'; red.resolvedAt = DB.now(); DB.upsert('redemptions', red); return { ok: false }; }
    if (profile.pointsBalance < red.cost) return { ok: false, reason: 'unaffordable' };
    updateProfile(profile.id, { pointsBalance: profile.pointsBalance - red.cost });
    addLedger(profile.id, -red.cost, reward ? reward.title : 'Reward', 'REDEMPTION', red.id);
    red.status = 'APPROVED'; red.resolvedAt = DB.now();
    DB.upsert('redemptions', red);
    return { ok: true, profile: DB.profile(profile.id), reward: reward };
  }
  function rejectRedemption(redemptionId) {
    var red = DB.find('redemptions', redemptionId);
    if (!red || red.status !== 'PENDING') return null;
    red.status = 'REJECTED'; red.resolvedAt = DB.now();
    return DB.upsert('redemptions', red);
  }
  function pendingRedemptions() {
    return DB.redemptions().filter(function (r) { return r.status === 'PENDING' && DB.reward(r.rewardId) && DB.profile(r.profileId); });
  }

  /* ---------------- savings goal ---------------- */
  function setGoal(profileId, rewardId) { return updateProfile(profileId, { goalRewardId: rewardId }); }
  function goalProgress(profile) {
    if (!profile || !profile.goalRewardId) return null;
    var reward = DB.reward(profile.goalRewardId); if (!reward) return null;
    return { reward: reward, frac: Math.min(1, profile.pointsBalance / Math.max(1, reward.cost)), remaining: Math.max(0, reward.cost - profile.pointsBalance), enough: profile.pointsBalance >= reward.cost };
  }

  /* ---------------- activity feed ---------------- */
  function recentActivity(limit) {
    limit = limit || 12;
    return DB.ledger().slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }).slice(0, limit).map(function (e) {
      var p = DB.profile(e.profileId);
      return { entry: e, name: p ? p.name : 'Someone', avatar: p ? p.avatar : '❓' };
    });
  }

  window.Engine = {
    CATEGORIES: CATEGORIES, ROUTINES: ROUTINES, CADENCE: CADENCE, PRAISE: PRAISE,
    POINT_CHOICES: POINT_CHOICES, AVATAR_EMOJIS: AVATAR_EMOJIS,
    STARTER_CHORES: STARTER_CHORES, STARTER_REWARDS: STARTER_REWARDS, BADGES: BADGES,
    catInfo: catInfo, routineInfo: routineInfo, cadenceLabel: cadenceLabel, dayKey: dayKey, todayKey: todayKey,
    computeStreak: computeStreak, badgeFor: badgeFor, lifetimeEarned: lifetimeEarned, streakFor: streakFor,
    createFamily: createFamily, addProfile: addProfile, updateProfile: updateProfile, deleteProfile: deleteProfile,
    kids: kids, parents: parents, hasParentPin: hasParentPin,
    addChore: addChore, updateChore: updateChore, deleteChore: deleteChore, seedStarterChores: seedStarterChores,
    choresForKid: choresForKid, choreStateForKid: choreStateForKid,
    completeChore: completeChore, approveCompletion: approveCompletion, rejectCompletion: rejectCompletion, pendingCompletions: pendingCompletions,
    addReward: addReward, updateReward: updateReward, deleteReward: deleteReward, seedStarterRewards: seedStarterRewards,
    requestRedemption: requestRedemption, approveRedemption: approveRedemption, rejectRedemption: rejectRedemption, pendingRedemptions: pendingRedemptions,
    setGoal: setGoal, goalProgress: goalProgress, recentActivity: recentActivity
  };
})();
