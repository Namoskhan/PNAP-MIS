import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../../api/client';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import Badge from '../Badge';

function fmtDate(d, t) {
  return d ? new Date(d).toLocaleDateString() : (t ? t('dashboard.never', 'Never') : 'Never');
}

function fmtDays(n, t) {
  if (n == null) return t ? t('dashboard.noActivityRecorded', 'No activity recorded') : 'No activity recorded';
  return t
    ? t('dashboard.daysSilent', '{{count}} days silent', { count: n.toLocaleString() })
    : `${n.toLocaleString()} days silent`;
}

function Pager({ page, pages, total, onPage, busy }) {
  const { t, isRTL } = useLanguage();
  if (!total || total === 0) return null;
  return (
    <View style={[styles.pagerRow, isRTL && { flexDirection: 'row-reverse' }]}>
      <Text style={[styles.pagerInfo, isRTL && { textAlign: 'right' }]}>
        {t('dashboard.pageOfRows', 'Page {{page}} of {{pages}} ({{total}} total)', {
          page,
          pages,
          total: total.toLocaleString(),
        })}
      </Text>
      <View style={[styles.pagerBtns, isRTL && { flexDirection: 'row-reverse' }]}>
        <TouchableOpacity
          disabled={busy || page <= 1}
          style={[styles.pagerBtn, (busy || page <= 1) && styles.pagerBtnDisabled]}
          onPress={() => onPage(page - 1)}
        >
          <Text style={styles.pagerBtnText}>{isRTL ? '→ ' + t('common.previous', 'Prev') : '← ' + t('common.previous', 'Prev')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy || page >= pages}
          style={[styles.pagerBtn, (busy || page >= pages) && styles.pagerBtnDisabled]}
          onPress={() => onPage(page + 1)}
        >
          <Text style={styles.pagerBtnText}>{isRTL ? t('common.next', 'Next') + ' ←' : t('common.next', 'Next') + ' →'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function InactiveUnitsTable({ params }) {
  const { t, isRTL } = useLanguage();
  const [level, setLevel] = useState('BASIC_UNIT');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  const unitLevels = [
    { key: 'BASIC_UNIT', label: t('units.basicUnits', 'Basic Units') },
    { key: 'AREA', label: t('units.areas', 'Areas') },
    { key: 'DISTRICT', label: t('units.districts', 'Districts') },
    { key: 'PROVINCE', label: t('units.provinces', 'Provinces') },
  ];

  useEffect(() => {
    setPage(1);
  }, [params, level]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    api.get('/dashboard/inactive-units', {
      params: { ...params, level, page, limit: 10 },
    })
      .then((r) => { if (alive) setData(r.data?.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [params, level, page]);

  const items = data?.items || [];
  const showingActive = params?.orgStatus === 'ACTIVE';

  return (
    <Card style={styles.card}>
      <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>
            {showingActive ? t('dashboard.activeUnitsDetail', 'Active Units') : t('dashboard.inactiveUnitsDetail', 'Dormant Units')}
          </Text>
          <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>
            {showingActive
              ? t('dashboard.activeUnitsSub', 'Key office bearers active inside window')
              : t('dashboard.inactiveUnitsSub', 'No activity inside window · Longest silence first')}
          </Text>
        </View>
      </View>

      {/* Tier Switcher Chips */}
      <View style={[styles.tierChipsRow, isRTL && { flexDirection: 'row-reverse' }]}>
        {unitLevels.map((l) => {
          const active = level === l.key;
          return (
            <TouchableOpacity
              key={l.key}
              style={[styles.tierChip, active && styles.tierChipActive]}
              onPress={() => setLevel(l.key)}
            >
              <Text style={[styles.tierChipText, active && styles.tierChipTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List Content */}
      {busy && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {showingActive
              ? t('dashboard.noActiveUnitsMatch', 'No active units match these filters.')
              : t('dashboard.noUnitsFoundSelection', 'Nothing dormant — every unit at this tier has recent activity!')}
          </Text>
        </View>
      ) : (
        <View style={styles.itemsList}>
          {items.map((u) => {
            const loc = [u.province, u.district, u.area, u.basicUnit].filter(Boolean).join(' › ');
            const statusLabel = u.status === 'ACTIVE'
              ? t('common.active', 'ACTIVE')
              : (u.status === 'DORMANT' ? t('common.inactive', 'DORMANT') : (u.status || t('common.inactive', 'INACTIVE')));

            return (
              <View key={u._id} style={styles.itemCard}>
                <View style={[styles.itemTop, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.itemLocation, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
                    {loc || t('dashboard.unit', 'Unit')}
                  </Text>
                  <Badge
                    label={statusLabel}
                    color={u.status === 'ACTIVE' ? Colors.success : Colors.warning}
                    bg={u.status === 'ACTIVE' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}
                  />
                </View>

                {/* Responsible Officer */}
                <View style={[styles.itemOfficer, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={styles.metaLabel}>{t('dashboard.officerInCharge', 'Officer')}: </Text>
                  {u.officer ? (
                    <Text style={[styles.officerText, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
                      {u.officer.fullName}{' '}
                      <Text style={styles.officerRole}>
                        ({String(u.officer.roleCode || '').replace(/_/g, ' ').toLowerCase()})
                      </Text>
                    </Text>
                  ) : (
                    <Text style={styles.noOfficerText}>{t('dashboard.noCabinetAppointed', 'No cabinet appointed')}</Text>
                  )}
                </View>

                {/* Activity & Days */}
                <View style={[styles.itemBottom, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={styles.metaText}>
                    {t('dashboard.lastActive', 'Last')}: {fmtDate(u.lastActivityAt, t)}
                  </Text>
                  <Text style={styles.daysText}>
                    {fmtDays(u.daysInactive, t)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Pager */}
      <Pager
        page={data?.page || 1}
        pages={data?.pages || 1}
        total={data?.total || 0}
        onPage={setPage}
        busy={busy}
      />
    </Card>
  );
}

export function InactiveMembersTable({ params }) {
  const { t, isRTL } = useLanguage();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setPage(1);
  }, [params]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    api.get('/dashboard/inactive-members', {
      params: { ...params, page, limit: 10 },
    })
      .then((r) => { if (alive) setData(r.data?.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [params, page]);

  const items = data?.items || [];

  return (
    <Card style={styles.card}>
      <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{t('dashboard.inactiveMembersDetail', 'Dormant Members')}</Text>
          <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>
            {t('dashboard.inactiveMembersSub', 'No meaningful organizational activity in window')}
          </Text>
        </View>
        <Text style={styles.metaCount}>
          {(data?.total || 0).toLocaleString()} {t('common.members', 'members')}
        </Text>
      </View>

      {busy && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {t('dashboard.noInactiveMembersFound', 'No dormant members match these filters.')}
          </Text>
        </View>
      ) : (
        <View style={styles.itemsList}>
          {items.map((m) => {
            const loc = [m.province, m.district, m.area, m.basicUnit].filter(Boolean).join(' › ');
            const statusLabel = m.status === 'ACTIVE'
              ? t('common.active', 'ACTIVE')
              : (m.status === 'DORMANT' ? t('common.inactive', 'DORMANT') : (m.status || t('common.inactive', 'INACTIVE')));

            return (
              <View key={m._id} style={styles.itemCard}>
                <View style={[styles.itemTop, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end' }]}>
                    <Text style={[styles.memberName, isRTL && { textAlign: 'right' }]} numberOfLines={1}>{m.fullName}</Text>
                    <Text style={[styles.memberCode, isRTL && { textAlign: 'right' }]}>{m.memberCode || '—'}</Text>
                  </View>
                  <Badge
                    label={statusLabel}
                    color={m.status === 'ACTIVE' ? Colors.success : Colors.textMuted}
                    bg={m.status === 'ACTIVE' ? 'rgba(22,163,74,0.12)' : 'rgba(100,116,139,0.12)'}
                  />
                </View>

                {loc ? (
                  <Text style={[styles.memberLoc, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
                    📍 {loc}
                  </Text>
                ) : null}

                <View style={[styles.itemBottom, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={styles.metaText}>
                    {t('dashboard.lastActive', 'Last')}: {fmtDate(m.lastActivityAt, t)}
                  </Text>
                  <Text style={styles.daysText}>
                    {fmtDays(m.daysInactive, t)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Pager */}
      <Pager
        page={data?.page || 1}
        pages={data?.pages || 1}
        total={data?.total || 0}
        onPage={setPage}
        busy={busy}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  metaCount: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  tierChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tierChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tierChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tierChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
  tierChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  center: {
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  itemsList: {
    gap: Spacing.xs,
  },
  itemCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  itemLocation: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  memberName: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  memberCode: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  memberLoc: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  itemOfficer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  officerText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  officerRole: {
    color: Colors.textMuted,
    fontWeight: '400',
  },
  noOfficerText: {
    fontSize: 11,
    color: Colors.warning,
    fontStyle: 'italic',
  },
  itemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  daysText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.error,
  },
  pagerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    marginTop: 4,
  },
  pagerInfo: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  pagerBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  pagerBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pagerBtnDisabled: {
    opacity: 0.4,
  },
  pagerBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
});
