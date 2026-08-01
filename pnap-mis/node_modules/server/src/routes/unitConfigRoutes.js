const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const tierCtrl = require('../controllers/unitTierConfigController');
const cabinetCtrl = require('../controllers/cabinetTemplateController');
const policyCtrl = require('../controllers/unitPolicyController');
const workflowCtrl = require('../controllers/workflowConfigController');
const respTemplateCtrl = require('../controllers/responsibilityTemplateController');
const perfRuleSetCtrl = require('../controllers/performanceRuleSetController');
const reportTemplateCtrl = require('../controllers/reportTemplateController');

const { tierConfigUpdateSchema } = require('../validators/unitTierSchemas');
const {
  cabinetTemplateCreateSchema,
  cabinetTemplateUpdateSchema,
} = require('../validators/cabinetTemplateSchemas');
const {
  unitPolicyCreateSchema,
  unitPolicyUpdateSchema,
} = require('../validators/unitPolicySchemas');
const {
  workflowCreateSchema,
  workflowUpdateSchema,
} = require('../validators/workflowSchemas');
const {
  responsibilityTemplateCreateSchema,
  responsibilityTemplateUpdateSchema,
} = require('../validators/responsibilityTemplateSchemas');
const {
  performanceRuleSetCreateSchema,
  performanceRuleSetUpdateSchema,
} = require('../validators/performanceRuleSetSchemas');
const {
  reportTemplateCreateSchema,
  reportTemplateUpdateSchema,
} = require('../validators/reportTemplateSchemas');

// Every endpoint requires authentication. Reads are open to anyone
// holding VIEW_UNIT_CONFIG or MANAGE_UNIT_CONFIG (so non-admin roles
// can be granted "look but don't touch" via the catalogue); writes
// require MANAGE_UNIT_CONFIG. SUPER_ADMIN always passes.
router.use(authenticate);

const READ = requirePermission('VIEW_UNIT_CONFIG', 'MANAGE_UNIT_CONFIG');
const WRITE = requirePermission('MANAGE_UNIT_CONFIG');

// ─── Tier configs (PR U1) ─────────────────────────────────────────
// `:tier` is the canonical tierCode (BASIC_UNIT / AREA / DISTRICT /
// PROVINCE / CENTRAL), not an ObjectId. There's exactly one row per
// tier so addressing by code is cleaner than by id.
router.get('/tier-configs',                  READ,  tierCtrl.list);
router.get('/tier-configs/:tier',            READ,  tierCtrl.getOne);
router.get('/tier-configs/:tier/snapshot',   READ,  tierCtrl.previewSnapshot);
router.patch('/tier-configs/:tier',          WRITE, validate(tierConfigUpdateSchema), tierCtrl.update);

// ─── Cabinet templates (PR U2) ────────────────────────────────────
router.get('/cabinet-templates',             READ,  cabinetCtrl.list);
router.get('/cabinet-templates/:id',         READ,  cabinetCtrl.getOne);
router.post('/cabinet-templates',            WRITE, validate(cabinetTemplateCreateSchema), cabinetCtrl.create);
router.patch('/cabinet-templates/:id',       WRITE, validate(cabinetTemplateUpdateSchema), cabinetCtrl.update);
router.delete('/cabinet-templates/:id',      WRITE, cabinetCtrl.remove);
router.post('/cabinet-templates/:id/rollout', WRITE, cabinetCtrl.rollout);

// ─── Unit policies (PR U3) ────────────────────────────────────────
// `resolve` ships the deep-merged policy for a (tier, unit) pair —
// useful for the admin UI's "what actually applies?" view. List the
// resolve route BEFORE `:id` so Express doesn't try to treat the
// string "resolve" as an ObjectId param.
router.get('/policies/resolve',              READ,  policyCtrl.resolve);
router.get('/policies',                      READ,  policyCtrl.list);
router.get('/policies/:id',                  READ,  policyCtrl.getOne);
router.post('/policies',                     WRITE, validate(unitPolicyCreateSchema), policyCtrl.create);
router.patch('/policies/:id',                WRITE, validate(unitPolicyUpdateSchema), policyCtrl.update);
router.delete('/policies/:id',               WRITE, policyCtrl.remove);

// ─── Workflow configs (PR U4) ─────────────────────────────────────
// `preview` resolves stages for a hypothetical payload — admin can
// inspect "what stages would fire if I tried to approve a 15000
// expense at AREA right now?" Same /:id-collision rule as policies.
router.get('/workflows/preview',             READ,  workflowCtrl.preview);
router.get('/workflows',                     READ,  workflowCtrl.list);
router.get('/workflows/:id',                 READ,  workflowCtrl.getOne);
router.post('/workflows',                    WRITE, validate(workflowCreateSchema), workflowCtrl.create);
router.patch('/workflows/:id',               WRITE, validate(workflowUpdateSchema), workflowCtrl.update);
router.delete('/workflows/:id',              WRITE, workflowCtrl.remove);

// ─── Responsibility templates (PR U5) ─────────────────────────────
router.get('/responsibility-templates',          READ,  respTemplateCtrl.list);
router.get('/responsibility-templates/:id',      READ,  respTemplateCtrl.getOne);
router.post('/responsibility-templates',         WRITE, validate(responsibilityTemplateCreateSchema), respTemplateCtrl.create);
router.patch('/responsibility-templates/:id',    WRITE, validate(responsibilityTemplateUpdateSchema), respTemplateCtrl.update);
router.delete('/responsibility-templates/:id',   WRITE, respTemplateCtrl.remove);

// ─── Performance rulesets (PR U6) ─────────────────────────────────
// `metrics` exposes the engine's hardcoded metric registry; `resolve`
// returns the active ruleset for a given tier. Both go BEFORE `:id`
// so Express doesn't treat the literal as an ObjectId param.
router.get('/performance-rulesets/metrics',      READ,  perfRuleSetCtrl.listMetrics);
router.get('/performance-rulesets/resolve',      READ,  perfRuleSetCtrl.resolve);
router.get('/performance-rulesets',              READ,  perfRuleSetCtrl.list);
router.get('/performance-rulesets/:id',          READ,  perfRuleSetCtrl.getOne);
router.post('/performance-rulesets',             WRITE, validate(performanceRuleSetCreateSchema), perfRuleSetCtrl.create);
router.patch('/performance-rulesets/:id',        WRITE, validate(performanceRuleSetUpdateSchema), perfRuleSetCtrl.update);
router.delete('/performance-rulesets/:id',       WRITE, perfRuleSetCtrl.remove);

// ─── Report templates (PR U7) ─────────────────────────────────────
// `sections` exposes the renderer registry so the admin UI's section
// picker has labels + defaults without duplicating a code-side enum.
// Goes BEFORE `:id` to avoid ObjectId-cast collision.
router.get('/report-templates/sections',         READ,  reportTemplateCtrl.listSections);
router.get('/report-templates',                  READ,  reportTemplateCtrl.list);
router.get('/report-templates/:id',              READ,  reportTemplateCtrl.getOne);
router.post('/report-templates',                 WRITE, validate(reportTemplateCreateSchema), reportTemplateCtrl.create);
router.patch('/report-templates/:id',            WRITE, validate(reportTemplateUpdateSchema), reportTemplateCtrl.update);
router.delete('/report-templates/:id',           WRITE, reportTemplateCtrl.remove);

module.exports = router;
