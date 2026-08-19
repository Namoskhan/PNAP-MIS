const router = require('express').Router();

router.use('/public', require('./publicRoutes'));
// Branding lite-payload for the unauthenticated login page. Mounted
// AFTER publicRoutes so existing /public/* paths take priority;
// /public/branding falls through here.
router.use('/public', require('./publicBrandingRoutes'));
router.use('/auth', require('./authRoutes'));
router.use('/org', require('./orgRoutes'));
// Read-only hierarchy navigation (fund-transfer destination picker).
// Separate mount from /org — see organizationRoutes for why.
router.use('/organization', require('./organizationRoutes'));
router.use('/members', require('./memberRoutes'));
router.use('/roles', require('./roleRoutes'));
router.use('/meetings', require('./meetingRoutes'));
router.use('/activities', require('./activityRoutes'));
router.use('/finance', require('./financeRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/committee', require('./committeeRoutes'));
router.use('/unit-proposals', require('./unitProposalRoutes'));
router.use('/transfers', require('./transferRoutes'));
router.use('/central', require('./centralRoutes'));
router.use('/responsibilities', require('./responsibilityRoutes'));
router.use('/performance', require('./performanceRoutes'));
router.use('/exports', require('./exportRoutes'));
router.use('/events', require('./eventsPublicRoutes'));
router.use('/reports', require('./reportTemplateRoutes'));
// More-specific /admin/* mounts must come BEFORE the generic /admin
// so Express matches the longest prefix first.
router.use('/admin/events', require('./eventConfigRoutes'));
router.use('/admin/units', require('./unitConfigRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/announcements', require('./announcementRoutes'));
// Authenticated branding endpoints — admin reads + writes.
router.use('/settings', require('./settingsRoutes'));

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));

module.exports = router;
