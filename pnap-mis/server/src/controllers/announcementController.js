const asyncHandler = require('express-async-handler');
const Announcement = require('../models/Announcement');
const Member = require('../models/Member');
const { ok, created, ApiError } = require('../utils/response');
const { resolveUnitChain, userHasRole, canPostAnnouncement } = require('../utils/unitScope');
const { notify, notifyMany, userIdForMember } = require('../utils/notify');
const User = require('../models/User');
const activityService = require('../services/activityService');

// Resolve the viewer's effective territorial chain. Admins use their
// scope; members use their member chain; CENTRAL roles see everything.
async function viewerChain(user) {
  if (userHasRole(user, 'SUPER_ADMIN')) return { isCentral: true };
  // Member-backed user — derive chain from the member record.
  if (user.memberId) {
    const m = await Member.findById(user.memberId)
      .select('basicUnitId areaId districtId provinceId').lean();
    if (m) return { provinceId: m.provinceId, districtId: m.districtId, areaId: m.areaId, basicUnitId: m.basicUnitId };
  }
  return {
    provinceId: user.scope?.provinceId,
    districtId: user.scope?.districtId,
    areaId: user.scope?.areaId,
    basicUnitId: user.scope?.basicUnitId,
  };
}

// Build a visibility filter: announcement is visible iff
//   • it's a direct message addressed to this viewer (memberId or userId), OR
//   • scope === 'GLOBAL', OR
//   • scope === 'OWN'    && viewer's chain id at announcement.unitLevel matches, OR
//   • scope === 'SUBTREE' && announcement's chain id at the viewer's level matches.
function visibilityFilter(viewer, user) {
  if (viewer.isCentral) return {}; // Super sees all
  const ors = [{ scope: 'GLOBAL' }];

  // Direct message — viewer is the explicit recipient.
  const dmOrs = [];
  if (user.memberId) dmOrs.push({ targetMemberId: user.memberId });
  if (user._id) dmOrs.push({ targetUserId: user._id });
  if (dmOrs.length) ors.push(...dmOrs);

  // OWN — viewer is exactly at this announcement's unit
  const ownClauses = [];
  if (viewer.basicUnitId) ownClauses.push({ scope: 'OWN', unitLevel: 'BASIC_UNIT', unitId: viewer.basicUnitId });
  if (viewer.areaId)      ownClauses.push({ scope: 'OWN', unitLevel: 'AREA',       unitId: viewer.areaId });
  if (viewer.districtId)  ownClauses.push({ scope: 'OWN', unitLevel: 'DISTRICT',   unitId: viewer.districtId });
  if (viewer.provinceId)  ownClauses.push({ scope: 'OWN', unitLevel: 'PROVINCE',   unitId: viewer.provinceId });
  if (ownClauses.length) ors.push(...ownClauses);

  // SUBTREE — announcement at a unit ABOVE the viewer.
  // We stored the announcement's denormalized chain (provinceId/etc.),
  // so a SUBTREE announcement is visible iff its chain field at its
  // own level equals the viewer's id at that same level.
  const subtreeClauses = [];
  if (viewer.provinceId) subtreeClauses.push({ scope: 'SUBTREE', provinceId: viewer.provinceId });
  if (viewer.districtId) subtreeClauses.push({ scope: 'SUBTREE', districtId: viewer.districtId });
  if (viewer.areaId)     subtreeClauses.push({ scope: 'SUBTREE', areaId: viewer.areaId });
  if (viewer.basicUnitId) subtreeClauses.push({ scope: 'SUBTREE', basicUnitId: viewer.basicUnitId });
  if (subtreeClauses.length) ors.push(...subtreeClauses);

  return { $or: ors };
}

exports.list = asyncHandler(async (req, res) => {
  const viewer = await viewerChain(req.user);
  const filter = visibilityFilter(viewer, req.user);
  // Hide expired announcements automatically. `$gt` (strictly greater
  // than now) means an announcement set to expire at 17:00:00 is gone
  // the instant the clock hits 17:00:00 — matches user expectation.
  filter.$and = [{ $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }];
  const items = await Announcement.find(filter)
    .sort({ pinned: -1, createdAt: -1 })
    .limit(100)
    .populate('targetMemberId', 'fullName memberId')
    .lean();
  ok(res, items);
});

exports.create = asyncHandler(async (req, res) => {
  // Per product directive — only the unit's operator (Senior Mawin
  // Sec. / its tier equivalent) and the General Secretary may post.
  // SUPER_ADMIN keeps an always-allowed override.
  if (!canPostAnnouncement(req.user)) {
    throw new ApiError(403, 'FORBIDDEN',
      'Only Senior Mawin Sec. / General Secretary (or Super Admin) may post announcements');
  }
  const data = req.body;

  // ── Direct-message branch ────────────────────────────────────
  // When targetMemberId is provided, this is a DM. unitLevel/scope
  // become metadata-only; visibility is one-recipient.
  if (data.targetMemberId) {
    const m = await Member.findById(data.targetMemberId).select('_id fullName basicUnitId areaId districtId provinceId').lean();
    if (!m) throw new ApiError(404, 'NOT_FOUND', 'Target member not found');
    const targetUserId = await userIdForMember(m._id); // null if member has no User account yet

    const doc = await Announcement.create({
      authorUserId: req.user._id,
      authorName: req.user.fullName,
      title: data.title,
      body: data.body,
      unitLevel: 'BASIC_UNIT',
      unitId: m.basicUnitId,
      basicUnitId: m.basicUnitId,
      areaId: m.areaId,
      districtId: m.districtId,
      provinceId: m.provinceId,
      scope: 'OWN',
      pinned: !!data.pinned,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      targetMemberId: m._id,
      targetUserId: targetUserId || undefined,
    });

    if (targetUserId) {
      notify(targetUserId, {
        type: 'ANNOUNCEMENT',
        severity: 'INFO',
        title: data.title,
        body: data.body.slice(0, 200),
        link: '/announcements',
        announcementId: doc._id,
        expiresAt: doc.expiresAt,
      }).catch(() => {});
    }

    activityService.record({
      action: 'ANNOUNCEMENT_CREATED',
      req,
      chain: { basicUnitId: m.basicUnitId, areaId: m.areaId, districtId: m.districtId, provinceId: m.provinceId },
      unitLevel: 'BASIC_UNIT',
      unitId: m.basicUnitId,
      targetType: 'Announcement',
      targetId: doc._id,
      targetLabel: doc.title,
    }).catch(() => {});

    return created(res, doc);
  }

  // ── Unit / global broadcast branch ───────────────────────────
  if (!data.unitLevel) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required (or provide targetMemberId for a direct message)');
  }
  let chain = { basicUnitId: null, areaId: null, districtId: null, provinceId: null };
  if (data.unitLevel !== 'CENTRAL') {
    if (!data.unitId) throw new ApiError(400, 'VALIDATION_ERROR', 'unitId required for non-CENTRAL announcements');
    chain = await resolveUnitChain(data.unitLevel, data.unitId);
    if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
  }

  const doc = await Announcement.create({
    authorUserId: req.user._id,
    authorName: req.user.fullName,
    title: data.title,
    body: data.body,
    unitLevel: data.unitLevel,
    unitId: data.unitId || null,
    ...chain,
    scope: data.scope || 'OWN',
    pinned: !!data.pinned,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
  });

  // Best-effort fan-out — also drop a Notification for every user
  // currently in the announcement's audience so the bell lights up.
  // Skip for very wide GLOBAL/CENTRAL broadcasts to avoid a write
  // storm; users will see those on the Announcements page.
  fanoutNotifications(doc).catch((err) => console.error('[announcement fanout]', err.message));

  // Announcement Creation, plus Notification Broadcast when this post
  // actually fans out to a bell audience (wide GLOBAL / CENTRAL posts
  // deliberately skip fan-out, so they are not broadcasts).
  const common = {
    req,
    chain,
    unitLevel: data.unitLevel,
    unitId: data.unitId || undefined,
    targetType: 'Announcement',
    targetId: doc._id,
    targetLabel: doc.title,
  };
  activityService.record({ ...common, action: 'ANNOUNCEMENT_CREATED' }).catch(() => {});
  if (doc.scope !== 'GLOBAL' && doc.unitLevel !== 'CENTRAL') {
    activityService.record({ ...common, action: 'NOTIFICATION_BROADCAST' }).catch(() => {});
  }

  created(res, doc);
});

// Internal — bell fan-out for narrowly-scoped announcements.
async function fanoutNotifications(a) {
  if (a.scope === 'GLOBAL' || a.unitLevel === 'CENTRAL') return; // skip wide broadcasts
  const audienceQuery = audienceFilter(a);
  if (!audienceQuery) return;
  const users = await User.find(audienceQuery).select('_id').lean();
  const ids = users.map((u) => u._id).filter((id) => String(id) !== String(a.authorUserId));
  await notifyMany(ids, {
    type: 'ANNOUNCEMENT',
    severity: 'INFO',
    title: a.title,
    body: a.body.slice(0, 200),
    link: '/announcements',
    announcementId: a._id,
    expiresAt: a.expiresAt,
  });
}

// Also wire delete → cascade: when an announcement is deleted by the
// author or Super Admin, drop every fan-out notification that points
// at it so it disappears from every recipient's bell + page.
exports.remove = asyncHandler(async (req, res) => {
  const Notification = require('../models/Notification');
  const a = await Announcement.findById(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', 'Announcement not found');
  if (String(a.authorUserId) !== String(req.user._id) && !userHasRole(req.user, 'SUPER_ADMIN')) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the author or a Super Admin may delete this announcement');
  }
  await Promise.all([
    a.deleteOne(),
    Notification.deleteMany({ announcementId: a._id }).catch(() => {}),
  ]);
  ok(res, { deleted: true });
});

// Convert an announcement's scope into a User filter that captures the
// audience. We notify admin users in scope and member-backed users
// whose Member chain falls within the announcement's chain.
function audienceFilter(a) {
  if (a.scope === 'OWN') {
    if (a.unitLevel === 'BASIC_UNIT') return { 'scope.basicUnitId': a.basicUnitId };
    if (a.unitLevel === 'AREA')       return { 'scope.areaId': a.areaId };
    if (a.unitLevel === 'DISTRICT')   return { 'scope.districtId': a.districtId };
    if (a.unitLevel === 'PROVINCE')   return { 'scope.provinceId': a.provinceId };
    return null;
  }
  if (a.scope === 'SUBTREE') {
    // Any user whose chain covers the announcement's level — admin or member-backed.
    const ors = [];
    if (a.basicUnitId) ors.push({ 'scope.basicUnitId': a.basicUnitId });
    if (a.areaId)      ors.push({ 'scope.areaId': a.areaId });
    if (a.districtId)  ors.push({ 'scope.districtId': a.districtId });
    if (a.provinceId)  ors.push({ 'scope.provinceId': a.provinceId });
    return ors.length ? { $or: ors } : null;
  }
  return null;
}
