const router = require('express').Router();
const ctrl = require('../controllers/settingsController');

// PUBLIC branding endpoint — NO authenticate middleware. Returns
// the lite projection (identity + login logo + favicon + login page +
// theme palette + typography) so the unauthenticated login page can
// render with the org's brand identity from the very first paint.
//
// settingsService.getPublic() is the gatekeeper for what's public:
// only fields explicitly listed there leave the server. Admin
// metadata (audit trails, full uploads metadata, etc.) stay private.
router.get('/branding', ctrl.getPublic);

module.exports = router;
