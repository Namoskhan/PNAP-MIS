// Ported from web/src/utils/formatters.js + mobile-specific additions.

// CNIC mask: 42101-1234567-1
export function formatCnic(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isCompleteCnic(v) {
  return /^\d{5}-\d{7}-\d$/.test(String(v || ''));
}

// Currency formatting — PKR with no decimals.
export const PKR = (amount) => {
  const n = Number(amount) || 0;
  if (n >= 1_000_000) return `PKR ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `PKR ${(n / 1_000).toFixed(1)}K`;
  return `PKR ${n.toLocaleString('en-PK')}`;
};

// Short date: "25 Aug 2026"
export function shortDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Relative time: "2 hours ago"
export function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(dateStr);
}

// Status display label
export function statusLabel(status) {
  const map = {
    PENDING_APPROVAL: 'Pending',
    ACTIVE: 'Active',
    REJECTED: 'Rejected',
    INACTIVE: 'Inactive',
    SUSPENDED: 'Suspended',
    APPROVED: 'Approved',
    PENDING: 'Pending',
    DRAFT: 'Draft',
  };
  return map[status] || (status || '—');
}

// Meeting type labels
export const MEETING_TYPE_LABEL = {
  GBM: 'General Body',
  EXC: 'Executive',
  PRT: 'Protest',
  JLS: 'Jalsa',
  CMP: 'Campaign',
  SEM: 'Seminar',
  STC: 'Study Circle',
  OTH: 'Other',
  CONGRESS: 'Congress',
};

// Activity type labels
export const ACTIVITY_TYPE_LABEL = {
  PROTEST: 'Protest',
  JALSA: 'Jalsa',
  CAMPAIGN: 'Campaign',
  SEMINAR: 'Seminar',
  STUDY_CIRCLE: 'Study Circle',
  TASK: 'Task',
  COMMUNITY_SERVICE: 'Community Service',
};
