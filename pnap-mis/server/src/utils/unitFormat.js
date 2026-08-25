/**
 * Unit & Committee tier formatting helpers for reports, exports, and dashboards.
 *
 * For committee items / views (body === 'COMMITTEE'):
 *   - PROVINCE   -> 'Sobayi' (e.g. 'Sobayi · Khyber Pakhtunkhwa')
 *   - DISTRICT   -> 'Zilla'  (e.g. 'Zilla · Peshawar')
 *   - AREA       -> 'Elaqai' (e.g. 'Elaqai · Gulshan')
 *   - CENTRAL    -> 'Central Committee'
 *   - BASIC_UNIT -> 'Basic Unit' (BU has no committee body)
 *
 * For regular / executive / general body items:
 *   - PROVINCE   -> 'Province'
 *   - DISTRICT   -> 'District'
 *   - AREA       -> 'Area'
 *   - BASIC_UNIT -> 'Basic Unit'
 *   - CENTRAL    -> 'Central'
 */

const COMMITTEE_TIER_LABELS = {
  PROVINCE: 'Sobayi',
  DISTRICT: 'Zilla',
  AREA: 'Elaqai',
  CENTRAL: 'Central Committee',
  BASIC_UNIT: 'Basic Unit',
};

const JIRGA_TIER_LABELS = {
  CENTRAL: 'Qomi Jirga',
  PROVINCE: 'Sobayi Jirga',
};

const REGULAR_TIER_LABELS = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
  CENTRAL: 'Central',
};

function getCommitteeTierLabel(level) {
  return COMMITTEE_TIER_LABELS[level] || level || '';
}

function getJirgaTierLabel(level) {
  return JIRGA_TIER_LABELS[level] || (level === 'CENTRAL' ? 'Qomi Jirga' : 'Sobayi Jirga');
}

function getRegularTierLabel(level) {
  return REGULAR_TIER_LABELS[level] || (level ? level.replace('_', ' ') : '');
}

/**
 * Resolves the unit name for a record by inspecting populated chain fields
 * or explicit name properties.
 */
function resolveRecordUnitName(record) {
  if (!record) return '';
  const level = record.unitLevel;

  if (level === 'BASIC_UNIT') {
    if (record.basicUnitId && typeof record.basicUnitId === 'object' && record.basicUnitId.name) {
      return record.basicUnitId.name;
    }
    return record._basicUnitName || record.unitName || '';
  }

  if (level === 'AREA') {
    if (record.areaId && typeof record.areaId === 'object' && record.areaId.name) {
      return record.areaId.name;
    }
    return record._areaName || record.unitName || '';
  }

  if (level === 'DISTRICT') {
    if (record.districtId && typeof record.districtId === 'object' && record.districtId.name) {
      return record.districtId.name;
    }
    return record._districtName || record.unitName || '';
  }

  if (level === 'PROVINCE') {
    if (record.provinceId && typeof record.provinceId === 'object' && record.provinceId.name) {
      return record.provinceId.name;
    }
    return record._provinceName || record.unitName || '';
  }

  if (level === 'CENTRAL') {
    return '';
  }

  return record.unitName || '';
}

/**
 * Formats who arranged/recorded a record.
 *
 * @param {Object} record - The document or POJO
 * @param {Object} [options]
 * @param {boolean} [options.isCommitteeView] - Override/force committee interpretation
 * @param {boolean} [options.isJirgaView] - Override/force jirga interpretation
 * @returns {string} Formatted label, e.g. "Qomi Jirga", "Sobayi Jirga · Sindh", "Sobayi · Sindh", "Zilla · Peshawar"
 */
function formatUnitArrangedBy(record, options = {}) {
  if (!record) return '—';
  const level = record.unitLevel;
  if (!level) return '—';

  const isJirga = options.isJirgaView
    || record.body === 'JIRGA'
    || record.type === 'JRG'
    || record.type === 'JIRGA'
    || record.typeCode === 'JRG'
    || record.typeCode === 'JIRGA';

  const isCommittee = !isJirga && (
    options.isCommitteeView
    || record.body === 'COMMITTEE'
    || record.type === 'CMP'
    || record.type === 'COMMITTEE'
    || record.typeCode === 'CMP'
    || record.typeCode === 'COMMITTEE'
  );

  const tierLabel = isJirga
    ? getJirgaTierLabel(level)
    : (isCommittee ? getCommitteeTierLabel(level) : getRegularTierLabel(level));
  const uName = resolveRecordUnitName(record);

  if (level === 'CENTRAL') {
    return tierLabel || 'Central';
  }

  if (tierLabel && uName) {
    return `${tierLabel} · ${uName}`;
  }
  return uName || tierLabel || '—';
}

module.exports = {
  COMMITTEE_TIER_LABELS,
  JIRGA_TIER_LABELS,
  REGULAR_TIER_LABELS,
  getCommitteeTierLabel,
  getJirgaTierLabel,
  getRegularTierLabel,
  resolveRecordUnitName,
  formatUnitArrangedBy,
};
