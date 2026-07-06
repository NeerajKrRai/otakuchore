/* ============================================================
   engine.js — business logic (ported from the Expo/Amplify app)
   Chores, approvals, rewards economy, points ledger, streaks,
   badges, categories/routines, starter packs. Zero backend.
   Depends on: window.DB   Exposes: window.Engine
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
  var ROUTINES = [ // display order
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
  var BADGES = [ // first threshold that matches, high → low
    { min: 500, emoji: '👑', label: 'Champion' },
    { min: 250, emoji: '🏆', label: 'Superstar' },
    { min: 100, emoji: '🥇', label: 'Pro' },
    { min: 50,  emoji: '🌟', label: 'Rising star' }
  ];

  /* ---------------- small lookups ---------------- */
  function byValue(list, v) {
    for (var i = 0; i < list.length; i++) if (list[i].value === v) return list[i];
    return list[0];
  }
  function catInfo(v) { return byValue(CATEGORIES, v); }
  function routineInfo(v) { return byValue(ROUTINES, v); }
  function cadenceLabel(v) { return v === 'ONE_OFF' ? 'One-off' : 'Repeating'; }
  function dayKey(iso) { var d = new Date(iso); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  /* ---------------- stats ---------------- */
  // Consecutive-day streak ending today, with same-day grace.
  function computeStreak(timestamps) {
    if (!timestamps || !timestamps.length) return 0;
    var set = {};
    timestamps.forEach(function (t) { set[dayKey(t)] = true; });
    var cursor = new Date();
    if (!set[todayKey()]) cursor.setDate(cursor.getDate() - 1); // no entry today → grace step back
    var streak = 0;
    while (true) {
      var k = cursor.getFullYear() + '-' + cursor.getMonth() + '-' + cursor.getDate();
      if (set[k]) { streak++; cursor.setDate(cursor.getDate() - 1); } else break;
    }
    return streak;
  }
  function badgeFor(lifetimeEarned) {
    for (var i = 0; i < BADGES.length; i++) if (lifetimeEarned >= BADGES[i].min) return BADGES[i];
    return null;
  }
  function lifetimeEarned(profileId) {
    return DB.ledger().reduce(function (sum, e) {
      return (e.profileId === profileId && e.delta > 0) ? sum + e.delta : sum;
    }, 0);
  }
  function streakFor(profileId) {
    var stamps = DB.ledger()
      .filter(function (e) { return e.profileId === profileId && e.delta > 0; })
      .map(function (e) { return e.createdAt; });
    return computeStreak(stamps);
  }

  /* ---------------- ledger ---------------- */
  function addLedger(profileId, delta, reason, refType, refId) {
    var ledger = DB.ledger();
    ledger.push({
      id: DB.uuid(), profileId: profileId, delta: delta, reason: reason,
      refType: refType, refId: refId, createdAt: DB.now()
    });
    DB.setLedger(ledger);
  }

  /* ---------------- family / profiles ---------------- */
  function createFamily(familyName, parent) {
    DB.setFamily({ name: familyName, createdAt: DB.now() });
    var p = addProfile({
      name: parent.name || 'Parent', role: 'PARENT',
      avatar: parent.avatar || '👑', avatarCfg: parent.avatarCfg || null,
      pin: parent.pin || null
    });
    return p;
  }
  function addProfile(data) {
    var profiles = DB.profiles();
    var p = {
      id: DB.uuid(),
      name: data.name,
      role: data.role === 'PARENT' ? 'PARENT' : 'CHILD',
      avatar: data.avatar || '🦊',
      avatarCfg: data.avatarCfg || null,
      pin: data.pin || null,
      pointsBalance: 0,
      goalRewardId: null,
      createdAt: DB.now()
    };
    profiles.push(p);
    DB.setProfiles(profiles);
    return p;
  }
  function updateProfile(id, patch) {
    var profiles = DB.profiles();
    var p = profiles.find(function (x) { return x.id === id; });
    if (!p) return null;
    Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    DB.setProfiles(profiles);
    return p;
  }
  function deleteProfile(id) {
    // cascade: drop their pending queue items, unassign their chores, drop their ledger
    DB.setCompletions(DB.completions().filter(function (c) {
      return !(c.profileId === id && c.status === 'PENDING');
    }));
    DB.setRedemptions(DB.redemptions().filter(function (r) {
      return !(r.profileId === id && r.status === 'PENDING');
    }));
    var chores = DB.chores();
    chores.forEach(function (c) { if (c.assignedProfileId === id) c.assignedProfileId = null; });
    DB.setChores(chores);
    DB.setLedger(DB.ledger().filter(function (e) { return e.profileId !== id; }));
    DB.setProfiles(DB.profiles().filter(function (p) { return p.id !== id; }));
  }
  function kids() { return DB.profiles().filter(function (p) { return p.role === 'CHILD'; }); }
  function parents() { return DB.profiles().filter(function (p) { return p.role === 'PARENT'; }); }
  function hasParentPin() { return parents().some(function (p) { return !!p.pin; }); }

  /* ---------------- chores ---------------- */
  function addChore(data) {
    var chores = DB.chores();
    var c = {
      id: DB.uuid(),
      title: data.title,
      description: data.description || '',
      points: data.points || 5,
      cadence: data.cadence === 'ONE_OFF' ? 'ONE_OFF' : 'DAILY',
      category: data.category || 'TASK',
      routine: data.routine || 'ANYTIME',
      assignedProfileId: data.assignedProfileId || null,
      active: true,
      createdAt: DB.now()
    };
    chores.push(c);
    DB.setChores(chores);
    return c;
  }
  function updateChore(id, patch) {
    var chores = DB.chores();
    var c = chores.find(function (x) { return x.id === id; });
    if (!c) return null;
    Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
    DB.setChores(chores);
    return c;
  }
  function deleteChore(id) {
    // collect media to purge, drop this chore's completions/proofs/messages, then the chore
    var mediaIds = DB.proofs()
      .filter(function (p) { return p.choreId === id && p.mediaId; })
      .map(function (p) { return p.mediaId; });
    DB.setCompletions(DB.completions().filter(function (c) { return c.choreId !== id; }));
    DB.setProofs(DB.proofs().filter(function (p) { return p.choreId !== id; }));
    DB.setMessages(DB.messages().filter(function (m) { return m.choreId !== id; }));
    DB.setChores(DB.chores().filter(function (c) { return c.id !== id; }));
    if (window.Media && mediaIds.length) window.Media.remove(mediaIds);
  }
  function seedStarterChores(assignToProfileId) {
    if (DB.chores().length) return 0;
    var chores = DB.chores();
    STARTER_CHORES.forEach(function (s) {
      chores.push({
        id: DB.uuid(), title: s.title, description: '', points: s.points,
        cadence: 'DAILY', category: s.category, routine: s.routine,
        assignedProfileId: assignToProfileId || null, active: true, createdAt: DB.now()
      });
    });
    DB.setChores(chores);
    var seeded = DB.seeded(); seeded.chores = true; DB.setSeeded(seeded);
    return STARTER_CHORES.length;
  }

  /* chore state for a kid, honouring daily reset & one-off retirement */
  function completionsFor(choreId, profileId) {
    return DB.completions().filter(function (c) {
      return c.choreId === choreId && c.profileId === profileId;
    });
  }
  function choreStateForKid(chore, profileId) {
    var today = todayKey();
    var mine = completionsFor(chore.id, profileId);
    // pending today?
    var pending = mine.find(function (c) { return c.status === 'PENDING'; });
    if (pending) return { state: 'pending', completion: pending };
    // approved today (daily chores show as done until tomorrow)?
    var doneToday = mine.find(function (c) {
      return c.status === 'APPROVED' && c.approvedAt && dayKey(c.approvedAt) === today;
    });
    if (doneToday) return { state: 'done', completion: doneToday };
    return { state: 'available', completion: null };
  }
  // active chores a kid should see: assigned to them, or unassigned (shared)
  function choresForKid(profileId) {
    return DB.chores().filter(function (c) {
      return c.active && (c.assignedProfileId === profileId || c.assignedProfileId == null);
    });
  }

  /* ---------------- completion (approval) flow ---------------- */
  function completeChore(choreId, profileId, proofId) {
    // one pending per (chore, profile)
    var existing = completionsFor(choreId, profileId).find(function (c) { return c.status === 'PENDING'; });
    if (existing) return existing;
    var comps = DB.completions();
    var comp = {
      id: DB.uuid(), choreId: choreId, profileId: profileId,
      status: 'PENDING', pointsAwarded: null,
      completedAt: DB.now(), approvedAt: null,
      proofId: proofId || null
    };
    comps.push(comp);
    DB.setCompletions(comps);
    return comp;
  }
  function approveCompletion(completionId) {
    var comps = DB.completions();
    var comp = comps.find(function (c) { return c.id === completionId; });
    if (!comp || comp.status !== 'PENDING') return null;
    var chore = DB.chore(comp.choreId);
    var profile = DB.profile(comp.profileId);
    if (!chore || !profile) { // orphan — drop it
      comp.status = 'REJECTED'; comp.approvedAt = DB.now(); DB.setCompletions(comps); return null;
    }
    var pts = chore.points;
    updateProfile(profile.id, { pointsBalance: profile.pointsBalance + pts });
    addLedger(profile.id, +pts, chore.title, 'CHORE', comp.id);
    comp.status = 'APPROVED'; comp.pointsAwarded = pts; comp.approvedAt = DB.now();
    DB.setCompletions(comps);
    if (chore.cadence === 'ONE_OFF') updateChore(chore.id, { active: false }); // retire one-offs
    return {
      profile: DB.profile(profile.id), points: pts, category: chore.category,
      message: (PRAISE[chore.category] || 'Nice work!') + ' +' + pts + ' ⭐'
    };
  }
  function rejectCompletion(completionId) {
    var comps = DB.completions();
    var comp = comps.find(function (c) { return c.id === completionId; });
    if (!comp || comp.status !== 'PENDING') return null;
    comp.status = 'REJECTED'; comp.approvedAt = DB.now();
    DB.setCompletions(comps);
    return comp;
  }
  // pending chore completions whose chore + kid still exist (orphans filtered)
  function pendingCompletions() {
    return DB.completions().filter(function (c) {
      return c.status === 'PENDING' && DB.chore(c.choreId) && DB.profile(c.profileId);
    });
  }

  /* ---------------- rewards economy ---------------- */
  function addReward(data) {
    var rewards = DB.rewards();
    var r = {
      id: DB.uuid(), title: data.title, description: data.description || '',
      cost: data.cost || 10, active: true, createdAt: DB.now()
    };
    rewards.push(r); DB.setRewards(rewards); return r;
  }
  function updateReward(id, patch) {
    var rewards = DB.rewards();
    var r = rewards.find(function (x) { return x.id === id; });
    if (!r) return null;
    Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
    DB.setRewards(rewards); return r;
  }
  function deleteReward(id) {
    DB.setRedemptions(DB.redemptions().filter(function (r) {
      return !(r.rewardId === id && r.status === 'PENDING');
    }));
    // clear anyone saving toward it
    var profiles = DB.profiles(), changed = false;
    profiles.forEach(function (p) { if (p.goalRewardId === id) { p.goalRewardId = null; changed = true; } });
    if (changed) DB.setProfiles(profiles);
    DB.setRewards(DB.rewards().filter(function (r) { return r.id !== id; }));
  }
  function seedStarterRewards() {
    if (DB.rewards().length) return 0;
    var rewards = DB.rewards();
    STARTER_REWARDS.forEach(function (s) {
      rewards.push({ id: DB.uuid(), title: s.title, description: '', cost: s.cost, active: true, createdAt: DB.now() });
    });
    DB.setRewards(rewards);
    var seeded = DB.seeded(); seeded.rewards = true; DB.setSeeded(seeded);
    return STARTER_REWARDS.length;
  }
  function requestRedemption(rewardId, profileId) {
    var reward = DB.reward(rewardId), profile = DB.profile(profileId);
    if (!reward || !profile) return null;
    if (profile.pointsBalance < reward.cost) return null; // can't afford
    // one pending redemption per (reward, profile)
    var dup = DB.redemptions().find(function (r) {
      return r.rewardId === rewardId && r.profileId === profileId && r.status === 'PENDING';
    });
    if (dup) return dup;
    var reds = DB.redemptions();
    var red = {
      id: DB.uuid(), rewardId: rewardId, profileId: profileId, cost: reward.cost,
      status: 'PENDING', requestedAt: DB.now(), resolvedAt: null
    };
    reds.push(red); DB.setRedemptions(reds); return red;
  }
  function approveRedemption(redemptionId) {
    var reds = DB.redemptions();
    var red = reds.find(function (r) { return r.id === redemptionId; });
    if (!red || red.status !== 'PENDING') return { ok: false };
    var profile = DB.profile(red.profileId), reward = DB.reward(red.rewardId);
    if (!profile) { red.status = 'REJECTED'; red.resolvedAt = DB.now(); DB.setRedemptions(reds); return { ok: false }; }
    if (profile.pointsBalance < red.cost) return { ok: false, reason: 'unaffordable' }; // stays pending
    updateProfile(profile.id, { pointsBalance: profile.pointsBalance - red.cost });
    addLedger(profile.id, -red.cost, reward ? reward.title : 'Reward', 'REDEMPTION', red.id);
    red.status = 'APPROVED'; red.resolvedAt = DB.now();
    DB.setRedemptions(reds);
    return { ok: true, profile: DB.profile(profile.id), reward: reward };
  }
  function rejectRedemption(redemptionId) {
    var reds = DB.redemptions();
    var red = reds.find(function (r) { return r.id === redemptionId; });
    if (!red || red.status !== 'PENDING') return null;
    red.status = 'REJECTED'; red.resolvedAt = DB.now();
    DB.setRedemptions(reds); return red;
  }
  function pendingRedemptions() {
    return DB.redemptions().filter(function (r) {
      return r.status === 'PENDING' && DB.reward(r.rewardId) && DB.profile(r.profileId);
    });
  }

  /* ---------------- savings goal ---------------- */
  function setGoal(profileId, rewardId) { return updateProfile(profileId, { goalRewardId: rewardId }); }
  function goalProgress(profile) {
    if (!profile || !profile.goalRewardId) return null;
    var reward = DB.reward(profile.goalRewardId);
    if (!reward) return null;
    var frac = Math.min(1, profile.pointsBalance / Math.max(1, reward.cost));
    return { reward: reward, frac: frac, remaining: Math.max(0, reward.cost - profile.pointsBalance), enough: profile.pointsBalance >= reward.cost };
  }

  /* ---------------- activity feed ---------------- */
  function recentActivity(limit) {
    limit = limit || 12;
    return DB.ledger().slice().sort(function (a, b) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }).slice(0, limit).map(function (e) {
      var p = DB.profile(e.profileId);
      return { entry: e, name: p ? p.name : 'Someone', avatar: p ? p.avatar : '❓' };
    });
  }

  window.Engine = {
    // constants
    CATEGORIES: CATEGORIES, ROUTINES: ROUTINES, CADENCE: CADENCE, PRAISE: PRAISE,
    POINT_CHOICES: POINT_CHOICES, AVATAR_EMOJIS: AVATAR_EMOJIS,
    STARTER_CHORES: STARTER_CHORES, STARTER_REWARDS: STARTER_REWARDS, BADGES: BADGES,
    // lookups + stats
    catInfo: catInfo, routineInfo: routineInfo, cadenceLabel: cadenceLabel,
    dayKey: dayKey, todayKey: todayKey,
    computeStreak: computeStreak, badgeFor: badgeFor, lifetimeEarned: lifetimeEarned, streakFor: streakFor,
    // family / profiles
    createFamily: createFamily, addProfile: addProfile, updateProfile: updateProfile, deleteProfile: deleteProfile,
    kids: kids, parents: parents, hasParentPin: hasParentPin,
    // chores
    addChore: addChore, updateChore: updateChore, deleteChore: deleteChore, seedStarterChores: seedStarterChores,
    choresForKid: choresForKid, choreStateForKid: choreStateForKid,
    completeChore: completeChore, approveCompletion: approveCompletion, rejectCompletion: rejectCompletion,
    pendingCompletions: pendingCompletions,
    // rewards
    addReward: addReward, updateReward: updateReward, deleteReward: deleteReward, seedStarterRewards: seedStarterRewards,
    requestRedemption: requestRedemption, approveRedemption: approveRedemption, rejectRedemption: rejectRedemption,
    pendingRedemptions: pendingRedemptions,
    // goal + activity
    setGoal: setGoal, goalProgress: goalProgress, recentActivity: recentActivity
  };
})();
