const RoleAssignment = require('../models/RoleAssignment');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const Member = require('../models/Member');
const PermanentMembership = require('../models/PermanentMembership');
const JirgaMember = require('../models/JirgaMember');
const CongressMember = require('../models/CongressMember');

const SUBORDINATE_KEY_ROLES = [
  'SECRETARY', 'SENIOR_MAWIN', 'PRESIDENT', 'GENERAL_SECRETARY', 'FIRST_SECRETARY', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT',
];

async function listSubordinateUnits(parentLevel, parentId) {
  if (parentLevel === 'AREA') {
    const units = await BasicUnit.find({ areaId: parentId, isActive: true }).select('name').lean();
    return units.map((u) => ({ ...u, level: 'BASIC_UNIT' }));
  }
  if (parentLevel === 'DISTRICT') {
    const areas = await Area.find({ districtId: parentId, isActive: true }).select('name').lean();
    return areas.map((a) => ({ ...a, level: 'AREA' }));
  }
  if (parentLevel === 'PROVINCE') {
    const districts = await District.find({ provinceId: parentId, isActive: true }).select('name code').lean();
    return districts.map((d) => ({ ...d, level: 'DISTRICT' }));
  }
  if (parentLevel === 'CENTRAL') {
    const provinces = await Province.find({ isActive: true }).select('name code').lean();
    return provinces.map((p) => ({ ...p, level: 'PROVINCE' }));
  }
  return [];
}

function formatMemberUnitText(m) {
  if (!m) return '';
  const parts = [];
  if (m.basicUnitId?.name) parts.push(`Basic Unit: ${m.basicUnitId.name}`);
  if (m.areaId?.name) parts.push(`Area: ${m.areaId.name}`);
  if (m.districtId?.name) parts.push(`District: ${m.districtId.name}`);
  if (m.provinceId?.name || m.provinceId?.code) parts.push(m.provinceId.name || m.provinceId.code);
  return parts.join(' · ') || '';
}

/**
 * Resolves eligible attendees & chairperson candidates based on meeting stream / type:
 * 1. Executive Meeting: ONLY office-holders / role holders of that unit level
 * 2. Committee Meeting: Committee composition (own cabinet + subordinate key roles + permanent members)
 * 3. General Body Meeting: All members (role holders or not) of that level and below (subordinates)
 * 4. Jirga Meeting: Active Jirga assembly members of that Central / Province unit
 * 5. Congress Meeting: Active National Congress assembly members (Central level)
 */
async function resolveEligibleAttendees({ unitLevel, unitId, body, typeCode }) {
  const normBody = body || (typeCode === 'GBM' || typeCode === 'GENERAL_BODY' ? 'GENERAL_BODY' : (typeCode === 'CMP' || typeCode === 'COMMITTEE' ? 'COMMITTEE' : (typeCode === 'JRG' || typeCode === 'JIRGA' ? 'JIRGA' : (typeCode === 'CNG' || typeCode === 'CONGRESS' ? 'CONGRESS' : 'EXECUTIVE'))));

  if (normBody === 'CONGRESS') {
    const congressMembers = await CongressMember.find({
      isActive: true,
    })
      .populate({
        path: 'memberId',
        select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
        populate: [
          { path: 'basicUnitId', select: 'name' },
          { path: 'areaId', select: 'name' },
          { path: 'districtId', select: 'name code' },
          { path: 'provinceId', select: 'name code' },
        ],
      })
      .lean();

    const attendeesMap = new Map();
    for (const cm of congressMembers) {
      if (cm.memberId && cm.memberId._id && cm.memberId.status !== 'INACTIVE') {
        const idStr = String(cm.memberId._id);
        const roleLabel = cm.assignedRoleSnapshot?.customRoleName
          || (cm.assignedRoleSnapshot?.roleCode ? cm.assignedRoleSnapshot.roleCode.replace(/_/g, ' ') : '')
          || 'Congress Member';
        const unitName = cm.assignedRoleSnapshot?.unitName ? ` · ${cm.assignedRoleSnapshot.unitName}` : '';
        const roleTag = `${roleLabel}${unitName}`;
        attendeesMap.set(idStr, {
          _id: cm.memberId._id,
          fullName: cm.memberId.fullName,
          memberId: cm.memberId.memberId,
          phone: cm.memberId.phone,
          cnic: cm.memberId.cnic,
          roleText: roleTag,
          unitText: formatMemberUnitText(cm.memberId),
          basicUnitId: cm.memberId.basicUnitId,
          areaId: cm.memberId.areaId,
          districtId: cm.memberId.districtId,
          provinceId: cm.memberId.provinceId,
          category: 'CONGRESS',
        });
      }
    }

    return Array.from(attendeesMap.values()).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  if (normBody === 'JIRGA') {
    const jirgaMembers = await JirgaMember.find({
      unitLevel,
      unitId,
      isActive: true,
    })
      .populate({
        path: 'memberId',
        select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
        populate: [
          { path: 'basicUnitId', select: 'name' },
          { path: 'areaId', select: 'name' },
          { path: 'districtId', select: 'name code' },
          { path: 'provinceId', select: 'name code' },
        ],
      })
      .lean();

    const attendeesMap = new Map();
    for (const jm of jirgaMembers) {
      if (jm.memberId && jm.memberId._id && jm.memberId.status !== 'INACTIVE') {
        const idStr = String(jm.memberId._id);
        const roleLabel = jm.assignedRoleSnapshot?.customRoleName
          || (jm.assignedRoleSnapshot?.roleCode ? jm.assignedRoleSnapshot.roleCode.replace(/_/g, ' ') : '')
          || 'Jirga Member';
        const unitName = jm.assignedRoleSnapshot?.unitName ? ` · ${jm.assignedRoleSnapshot.unitName}` : '';
        const roleTag = `${roleLabel}${unitName}`;
        attendeesMap.set(idStr, {
          _id: jm.memberId._id,
          fullName: jm.memberId.fullName,
          memberId: jm.memberId.memberId,
          phone: jm.memberId.phone,
          cnic: jm.memberId.cnic,
          roleText: roleTag,
          unitText: formatMemberUnitText(jm.memberId),
          basicUnitId: jm.memberId.basicUnitId,
          areaId: jm.memberId.areaId,
          districtId: jm.memberId.districtId,
          provinceId: jm.memberId.provinceId,
          category: 'JIRGA',
        });
      }
    }

    return Array.from(attendeesMap.values()).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  if (normBody === 'EXECUTIVE') {
    const assignments = await RoleAssignment.find({
      unitLevel,
      unitId,
      state: 'APPROVED',
      endedAt: { $exists: false },
    })
      .populate({
        path: 'memberId',
        select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
        populate: [
          { path: 'basicUnitId', select: 'name' },
          { path: 'areaId', select: 'name' },
          { path: 'districtId', select: 'name code' },
          { path: 'provinceId', select: 'name code' },
        ],
      })
      .lean();

    const attendeesMap = new Map();
    for (const a of assignments) {
      if (a.memberId && a.memberId._id && a.memberId.status !== 'INACTIVE') {
        const idStr = String(a.memberId._id);
        const roleLabel = a.customRoleName || a.customName || a.roleCode;
        const existing = attendeesMap.get(idStr);
        if (!existing) {
          attendeesMap.set(idStr, {
            _id: a.memberId._id,
            fullName: a.memberId.fullName,
            memberId: a.memberId.memberId,
            phone: a.memberId.phone,
            cnic: a.memberId.cnic,
            roleText: roleLabel,
            unitText: formatMemberUnitText(a.memberId),
            basicUnitId: a.memberId.basicUnitId,
            areaId: a.memberId.areaId,
            districtId: a.memberId.districtId,
            provinceId: a.memberId.provinceId,
            category: 'CABINET',
          });
        } else {
          existing.roleText = `${existing.roleText}, ${roleLabel}`;
        }
      }
    }
    return Array.from(attendeesMap.values()).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  if (normBody === 'COMMITTEE') {
    const attendeesMap = new Map();

    // a) Own Cabinet
    const ownCabinet = await RoleAssignment.find({
      unitLevel,
      unitId,
      state: 'APPROVED',
      endedAt: { $exists: false },
    })
      .populate({
        path: 'memberId',
        select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
        populate: [
          { path: 'basicUnitId', select: 'name' },
          { path: 'areaId', select: 'name' },
          { path: 'districtId', select: 'name code' },
          { path: 'provinceId', select: 'name code' },
        ],
      })
      .lean();

    for (const a of ownCabinet) {
      if (a.memberId && a.memberId._id && a.memberId.status !== 'INACTIVE') {
        const idStr = String(a.memberId._id);
        const roleLabel = a.customRoleName || a.customName || a.roleCode;
        attendeesMap.set(idStr, {
          _id: a.memberId._id,
          fullName: a.memberId.fullName,
          memberId: a.memberId.memberId,
          phone: a.memberId.phone,
          cnic: a.memberId.cnic,
          roleText: `${roleLabel} (${unitLevel ? unitLevel.replace('_', ' ') : ''})`,
          unitText: formatMemberUnitText(a.memberId),
          basicUnitId: a.memberId.basicUnitId,
          areaId: a.memberId.areaId,
          districtId: a.memberId.districtId,
          provinceId: a.memberId.provinceId,
          category: 'CABINET',
        });
      }
    }

    // b) Subordinates
    const subs = await listSubordinateUnits(unitLevel, unitId);
    if (subs.length > 0) {
      const subRoles = await RoleAssignment.find({
        $or: subs.map((s) => ({ unitLevel: s.level, unitId: s._id })),
        roleCode: { $in: SUBORDINATE_KEY_ROLES },
        state: 'APPROVED',
        endedAt: { $exists: false },
      })
        .populate({
          path: 'memberId',
          select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
          populate: [
            { path: 'basicUnitId', select: 'name' },
            { path: 'areaId', select: 'name' },
            { path: 'districtId', select: 'name code' },
            { path: 'provinceId', select: 'name code' },
          ],
        })
        .lean();

      const subUnitMap = new Map(subs.map((s) => [String(s._id), s.name]));

      for (const a of subRoles) {
        if (a.memberId && a.memberId._id && a.memberId.status !== 'INACTIVE') {
          const idStr = String(a.memberId._id);
          if (!attendeesMap.has(idStr)) {
            const unitName = subUnitMap.get(String(a.unitId)) || a.unitLevel;
            const roleLabel = a.customRoleName || a.customName || a.roleCode;
            attendeesMap.set(idStr, {
              _id: a.memberId._id,
              fullName: a.memberId.fullName,
              memberId: a.memberId.memberId,
              phone: a.memberId.phone,
              cnic: a.memberId.cnic,
              roleText: `${roleLabel} · ${unitName}`,
              unitText: formatMemberUnitText(a.memberId),
              basicUnitId: a.memberId.basicUnitId,
              areaId: a.memberId.areaId,
              districtId: a.memberId.districtId,
              provinceId: a.memberId.provinceId,
              category: 'SUBORDINATE',
            });
          }
        }
      }
    }

    // c) Permanent / Selective members
    const permanent = await PermanentMembership.find({
      unitLevel,
      unitId,
      bodyType: 'COMMITTEE',
      isActive: true,
    })
      .populate({
        path: 'memberId',
        select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
        populate: [
          { path: 'basicUnitId', select: 'name' },
          { path: 'areaId', select: 'name' },
          { path: 'districtId', select: 'name code' },
          { path: 'provinceId', select: 'name code' },
        ],
      })
      .lean();

    for (const p of permanent) {
      if (p.memberId && p.memberId._id && p.memberId.status !== 'INACTIVE') {
        const idStr = String(p.memberId._id);
        if (!attendeesMap.has(idStr)) {
          attendeesMap.set(idStr, {
            _id: p.memberId._id,
            fullName: p.memberId.fullName,
            memberId: p.memberId.memberId,
            phone: p.memberId.phone,
            cnic: p.memberId.cnic,
            roleText: 'Selective Member',
            unitText: formatMemberUnitText(p.memberId),
            basicUnitId: p.memberId.basicUnitId,
            areaId: p.memberId.areaId,
            districtId: p.memberId.districtId,
            provinceId: p.memberId.provinceId,
            category: 'PERMANENT',
          });
        }
      }
    }

    return Array.from(attendeesMap.values()).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  // General Body Meeting (GENERAL_BODY):
  // All members (role holders or regular members), own & subordinate cabinet role-holders,
  // and Committee members (for Area level and above, excluding Basic Unit).
  if (normBody === 'GENERAL_BODY') {
    const attendeesMap = new Map();

    // 1. Resolve subordinate units list and IDs
    let buIds = [];
    let areaIds = [];
    let districtIds = [];
    const subUnitQuery = [];

    if (unitLevel === 'BASIC_UNIT') {
      // Basic unit has no subordinates and no committee
    } else if (unitLevel === 'AREA') {
      const bus = await BasicUnit.find({ areaId: unitId, isActive: true }).select('_id name').lean();
      buIds = bus.map((b) => b._id);
      if (buIds.length > 0) subUnitQuery.push({ unitLevel: 'BASIC_UNIT', unitId: { $in: buIds } });
    } else if (unitLevel === 'DISTRICT') {
      const areas = await Area.find({ districtId: unitId, isActive: true }).select('_id name').lean();
      areaIds = areas.map((a) => a._id);
      const bus = await BasicUnit.find({ areaId: { $in: areaIds }, isActive: true }).select('_id name').lean();
      buIds = bus.map((b) => b._id);
      if (areaIds.length > 0) subUnitQuery.push({ unitLevel: 'AREA', unitId: { $in: areaIds } });
      if (buIds.length > 0) subUnitQuery.push({ unitLevel: 'BASIC_UNIT', unitId: { $in: buIds } });
    } else if (unitLevel === 'PROVINCE') {
      const districts = await District.find({ provinceId: unitId, isActive: true }).select('_id name').lean();
      districtIds = districts.map((d) => d._id);
      const areas = await Area.find({ districtId: { $in: districtIds }, isActive: true }).select('_id name').lean();
      areaIds = areas.map((a) => a._id);
      const bus = await BasicUnit.find({ areaId: { $in: areaIds }, isActive: true }).select('_id name').lean();
      buIds = bus.map((b) => b._id);
      if (districtIds.length > 0) subUnitQuery.push({ unitLevel: 'DISTRICT', unitId: { $in: districtIds } });
      if (areaIds.length > 0) subUnitQuery.push({ unitLevel: 'AREA', unitId: { $in: areaIds } });
      if (buIds.length > 0) subUnitQuery.push({ unitLevel: 'BASIC_UNIT', unitId: { $in: buIds } });
    }

    // 2. Fetch own and subordinate cabinet / role holders
    const roleConditions = [{ unitLevel, unitId }];
    if (unitLevel === 'CENTRAL') {
      roleConditions.length = 0;
    } else if (subUnitQuery.length > 0) {
      roleConditions.push(...subUnitQuery);
    }

    const roleFilter = {
      state: 'APPROVED',
      endedAt: { $exists: false },
    };
    if (roleConditions.length > 0) {
      roleFilter.$or = roleConditions;
    }

    const assignments = await RoleAssignment.find(roleFilter)
      .populate({
        path: 'memberId',
        select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
        populate: [
          { path: 'basicUnitId', select: 'name' },
          { path: 'areaId', select: 'name' },
          { path: 'districtId', select: 'name code' },
          { path: 'provinceId', select: 'name code' },
        ],
      })
      .lean();

    for (const a of assignments) {
      if (a.memberId && a.memberId._id && a.memberId.status !== 'INACTIVE') {
        const idStr = String(a.memberId._id);
        const roleLabel = a.customRoleName || a.customName || a.roleCode;
        const levelTag = a.unitLevel === unitLevel ? '' : ` (${a.unitLevel.replace('_', ' ')})`;
        const fullRole = `${roleLabel}${levelTag}`;
        const existing = attendeesMap.get(idStr);
        if (!existing) {
          attendeesMap.set(idStr, {
            _id: a.memberId._id,
            fullName: a.memberId.fullName,
            memberId: a.memberId.memberId,
            phone: a.memberId.phone,
            cnic: a.memberId.cnic,
            roleText: fullRole,
            unitText: formatMemberUnitText(a.memberId),
            basicUnitId: a.memberId.basicUnitId,
            areaId: a.memberId.areaId,
            districtId: a.memberId.districtId,
            provinceId: a.memberId.provinceId,
            category: a.unitLevel === unitLevel ? 'CABINET' : 'SUBORDINATE',
          });
        } else if (!existing.roleText.includes(roleLabel)) {
          existing.roleText = `${existing.roleText}, ${fullRole}`;
        }
      }
    }

    // 3. Fetch Committee Permanent Members (for Area level and above, excluding Basic Unit)
    if (unitLevel !== 'BASIC_UNIT') {
      const permConditions = [{ unitLevel, unitId }];
      if (unitLevel === 'CENTRAL') {
        permConditions.length = 0;
      } else if (subUnitQuery.length > 0) {
        permConditions.push(...subUnitQuery);
      }

      const permFilter = { isActive: true };
      if (permConditions.length > 0) {
        permFilter.$or = permConditions;
      }

      const permanent = await PermanentMembership.find(permFilter)
        .populate({
          path: 'memberId',
          select: 'fullName memberId phone photoUrl cnic status basicUnitId areaId districtId provinceId',
          populate: [
            { path: 'basicUnitId', select: 'name' },
            { path: 'areaId', select: 'name' },
            { path: 'districtId', select: 'name code' },
            { path: 'provinceId', select: 'name code' },
          ],
        })
        .lean();

      for (const p of permanent) {
        if (p.memberId && p.memberId._id && p.memberId.status !== 'INACTIVE') {
          const idStr = String(p.memberId._id);
          const existing = attendeesMap.get(idStr);
          if (!existing) {
            attendeesMap.set(idStr, {
              _id: p.memberId._id,
              fullName: p.memberId.fullName,
              memberId: p.memberId.memberId,
              phone: p.memberId.phone,
              cnic: p.memberId.cnic,
              roleText: 'Selective Committee Member',
              unitText: formatMemberUnitText(p.memberId),
              basicUnitId: p.memberId.basicUnitId,
              areaId: p.memberId.areaId,
              districtId: p.memberId.districtId,
              provinceId: p.memberId.provinceId,
              category: 'PERMANENT',
            });
          } else if (!existing.roleText.includes('Selective Committee Member') && !existing.roleText.includes('Committee')) {
            existing.roleText = `${existing.roleText}, Selective Committee Member`;
          }
        }
      }
    }

    // 4. Fetch all registered local & subordinate members
    let memberFilter = { status: 'ACTIVE' };
    if (unitLevel === 'BASIC_UNIT') {
      memberFilter.basicUnitId = unitId;
    } else if (unitLevel === 'AREA') {
      memberFilter.$or = [
        { areaId: unitId },
        { basicUnitId: { $in: buIds } },
      ];
    } else if (unitLevel === 'DISTRICT') {
      memberFilter.$or = [
        { districtId: unitId },
        { areaId: { $in: areaIds } },
        { basicUnitId: { $in: buIds } },
      ];
    } else if (unitLevel === 'PROVINCE') {
      memberFilter.provinceId = unitId;
    } else if (unitLevel === 'CENTRAL') {
      memberFilter = { status: 'ACTIVE' };
    }

    const members = await Member.find(memberFilter)
      .select('fullName memberId phone cnic status basicUnitId areaId districtId provinceId')
      .populate('basicUnitId', 'name')
      .populate('areaId', 'name')
      .populate('districtId', 'name')
      .populate('provinceId', 'name code')
      .sort({ fullName: 1 })
      .limit(1000)
      .lean();

    for (const m of members) {
      const idStr = String(m._id);
      if (!attendeesMap.has(idStr)) {
        attendeesMap.set(idStr, {
          _id: m._id,
          fullName: m.fullName,
          memberId: m.memberId,
          phone: m.phone,
          cnic: m.cnic,
          roleText: 'Member',
          unitText: formatMemberUnitText(m),
          basicUnitId: m.basicUnitId,
          areaId: m.areaId,
          districtId: m.districtId,
          provinceId: m.provinceId,
          category: 'MEMBER',
        });
      }
    }

    return Array.from(attendeesMap.values()).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }

  return [];
}

module.exports = {
  resolveEligibleAttendees,
};
