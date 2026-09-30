# Area Current Pipeline Mapping (Phase O8)

## 1. Context and Function Entry Point
- **File**: `pnap-mis/server/src/services/analyticsService.js`
- **Method**: `officeBearerActivity('AREA')`
- **Caller**: `orgSnapshot(f)` via `Promise.all([ ..., officeBearerActivity('AREA'), ... ])`

## 2. Pipeline Definition
```javascript
RoleAssignment.aggregate([
  {
    $match: {
      unitLevel: 'AREA',
      roleCode: { $in: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'] },
      state: 'APPROVED',
      endedAt: { $exists: false },
    },
  },
  {
    $lookup: {
      from: 'members',
      let: { mid: '$memberId' },
      pipeline: [
        { $match: { $expr: { $eq: ['$_id', '$$mid'] } } },
        { $project: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } },
      ],
      as: 'member',
    },
  },
  { $unwind: { path: '$member', preserveNullAndEmptyArrays: false } },
  {
    $group: {
      _id: '$unitId',
      lastActivityAt: { $max: '$member.lastActivityAt' },
      officers: {
        $push: {
          roleCode: '$roleCode',
          memberId: '$member._id',
          memberCode: '$member.memberId',
          fullName: '$member.fullName',
          phone: '$member.phone',
          lastActivityAt: '$member.lastActivityAt',
        },
      },
    },
  },
]);
```

## 3. Stage-by-Stage Breakdown
1. **Outer `$match`**:
   - `unitLevel: 'AREA'`
   - `roleCode: { $in: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'] }`
   - `state: 'APPROVED'`
   - `endedAt: { $exists: false }`
   - **Index Used**: `{ unitLevel: 1, state: 1, roleCode: 1, endedAt: 1 }` (IXSCAN).
   - **Matching volume**:
     - 10k: 1,500 documents (across 500 areas).
     - 50k: 7,500 documents (across 2,500 areas).
2. **Member `$lookup`**:
   - Subquery correlated join on collection `members`.
   - `let: { mid: '$memberId' }`
   - Inner pipeline matches `_id == $$mid` using `{ _id: 1 }` primary key index on `members`.
   - Inner projection: `{ fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 }`.
   - **Execution count**:
     - 10k: 1,500 executions of the lookup subquery.
     - 50k: 7,500 executions of the lookup subquery.
3. **`$unwind`**:
   - `path: '$member'`, `preserveNullAndEmptyArrays: false`.
   - Flattens the 1-element member array produced by `$lookup`.
4. **`$group`**:
   - `_id: '$unitId'`: Groups role assignment records by area ID.
   - Accumulator `lastActivityAt: { $max: '$member.lastActivityAt' }`: Tracks the most recent activity timestamp across all office bearers of that area.
   - Accumulator `officers: { $push: ... }`: Accumulates the subdocuments for all matched office bearers.

## 4. Post-Processing Logic (Node-side)
```javascript
const map = new Map();
for (const r of rows) {
  const officers = r.officers || [];
  const officer = OFFICER_PRIORITY
    .map((code) => officers.find((o) => o.roleCode === code))
    .find(Boolean) || officers[0] || null;
  map.set(str(r._id), {
    lastActivityAt: r.lastActivityAt || null,
    officer,
    officerCount: officers.length,
  });
}
```
- **Officer Priority Order**: `['PRESIDENT', 'CHAIRMAN', 'GENERAL_SECRETARY', 'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY']`. For Area, `SECRETARY` is chosen first, fallback to `SENIOR_MAWIN`, fallback to `FINANCE_SECRETARY`, fallback to `officers[0]`.
- **Unit Output Shape**:
  - `lastActivityAt`: `Date | null`
  - `officer`: `{ roleCode, memberId, memberCode, fullName, phone, lastActivityAt } | null`
  - `officerCount`: integer (total assigned mandatory officers, e.g. 3)
