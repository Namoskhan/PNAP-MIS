// Section renderer registry — locks the universe of section kinds
// admins can compose into a ReportTemplate. New section kinds = new
// file in this folder + one entry here + a code review (NOT a
// runtime configuration). That's the safety guarantee that keeps
// reports auditable: admins compose, never define new behavior.

const Cover = require('./CoverSection');
const SummaryKpis = require('./SummaryKpisSection');
const MeetingsList = require('./MeetingsListSection');
const ActivitiesList = require('./ActivitiesListSection');
const DonationsTable = require('./DonationsTableSection');
const ExpensesTable = require('./ExpensesTableSection');

const SECTIONS = [
  Cover,
  SummaryKpis,
  MeetingsList,
  ActivitiesList,
  DonationsTable,
  ExpensesTable,
];

const REGISTRY = Object.fromEntries(SECTIONS.map((s) => [s.kind, s]));

function getSection(kind) {
  return REGISTRY[String(kind).toUpperCase()] || null;
}

// list — exported metadata for the admin UI's section picker.
// Does NOT include the renderPdf / renderXlsx functions (callers
// don't need to know about them; they invoke through the service).
function list() {
  return SECTIONS.map((s) => ({
    kind: s.kind,
    label: s.label,
    description: s.description,
    defaultTitle: s.defaultTitle,
    defaultConfig: s.defaultConfig || {},
  }));
}

module.exports = { REGISTRY, getSection, list };
