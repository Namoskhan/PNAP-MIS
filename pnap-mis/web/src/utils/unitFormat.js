// Client-side unit tier naming and committee formatting helpers.
// Mirrors server/src/utils/unitFormat.js for consistent tier representations.

export const COMMITTEE_TIER_LABELS = {
  PROVINCE: 'Sobayi',
  DISTRICT: 'Zilla',
  AREA: 'Elaqai',
  CENTRAL: 'Central Committee',
  BASIC_UNIT: 'Basic Unit',
};

export const REGULAR_TIER_LABELS = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
  CENTRAL: 'Central',
};

export function getCommitteeTierLabel(level) {
  if (!level) return '';
  const key = String(level).toUpperCase().replace(/\s+/g, '_');
  return COMMITTEE_TIER_LABELS[key] || level;
}

export function getRegularTierLabel(level) {
  if (!level) return '';
  const key = String(level).toUpperCase().replace(/\s+/g, '_');
  return REGULAR_TIER_LABELS[key] || level;
}

export function resolveRecordUnitName(record) {
  if (!record) return '';
  const level = record.unitLevel;
  if (level === 'BASIC_UNIT') {
    return record.basicUnitId?.name || (typeof record.basicUnitId === 'string' ? '' : '') || record.unitName || '';
  }
  if (level === 'AREA') {
    return record.areaId?.name || (typeof record.areaId === 'string' ? '' : '') || record.unitName || '';
  }
  if (level === 'DISTRICT') {
    return record.districtId?.name || (typeof record.districtId === 'string' ? '' : '') || record.unitName || '';
  }
  if (level === 'PROVINCE') {
    return record.provinceId?.name || (typeof record.provinceId === 'string' ? '' : '') || record.unitName || '';
  }
  if (level === 'CENTRAL') {
    return 'Central';
  }
  return record.unitName || '';
}

/**
 * Returns formatted indication of who arranged / incurred a record.
 * e.g.:
 *   - Committee context: "Sobayi · Khyber Pakhtunkhwa", "Zilla · Peshawar", "Elaqai · Gulshan", "Central Committee"
 *   - Regular context: "Province · Khyber Pakhtunkhwa", "District · Peshawar", "Area · Gulshan", "Basic Unit · Ward 1"
 */
export function formatUnitArrangedBy(record, options = {}) {
  if (!record) return '';
  const isCongress = options.isCongressView || record.body === 'CONGRESS';
  if (isCongress) {
    return 'National Congress · Central';
  }
  const isJirga = options.isJirgaView || record.body === 'JIRGA';
  if (isJirga) {
    return options.unitLevel === 'CENTRAL' || record.unitLevel === 'CENTRAL' ? 'Qomi Jirga' : `Sobayi Jirga · ${resolveRecordUnitName(record) || options.unitName || ''}`;
  }
  const isCommittee = options.isCommitteeView || record.body === 'COMMITTEE';
  const level = record.unitLevel || options.unitLevel;
  const name = resolveRecordUnitName(record) || options.unitName || '';

  if (!level && !name) return '—';

  if (isCommittee) {
    const tier = getCommitteeTierLabel(level);
    if (level === 'CENTRAL') {
      return tier || 'Central Committee';
    }
    if (tier && name) return `${tier} · ${name}`;
    if (tier) return tier;
    return name || '—';
  }

  const tier = getRegularTierLabel(level);
  if (level === 'CENTRAL') {
    return 'Central';
  }
  if (tier && name) return `${tier} · ${name}`;
  if (tier) return tier;
  return name || '—';
}
