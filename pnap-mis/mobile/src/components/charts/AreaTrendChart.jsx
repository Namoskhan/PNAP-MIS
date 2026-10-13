import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

/**
 * AreaTrendChart component for mobile.
 *
 * Accepts `trend` buckets from the analytics API in one of two formats:
 *   { month: 'YYYY-MM', label: 'Jan', newMembers: N }   (from /dashboard/membership)
 *   { month: 'YYYY-MM', total: N }                       (internal mapping)
 *   { month: 'YYYY-MM', value: N }                       (generic)
 *   { month: 'YYYY-MM', meetings: M, activities: A }    (unit dashboard)
 *
 * Props:
 *   trend        Array of bucket objects
 *   height       Bar chart height in px (default 130)
 *   barColor     Filled bar colour
 *   trackColor   Background bar colour
 *   scrollable   If true, wraps bars in a horizontal ScrollView so
 *                all-time (many months) data remains readable
 *   valueKey     Which key to read from each bucket (default: auto-detect)
 */
export default function AreaTrendChart({
  trend = [],
  height = 130,
  barColor = '#1e40af',
  trackColor = '#eff6ff',
  scrollable = false,
  valueKey = null,
}) {
  if (!trend || trend.length === 0) {
    return <Text style={styles.empty}>Not enough trend data.</Text>;
  }

  // ── Month label formatter ──────────────────────────────────────────
  // The API returns `label` ('Jan', 'Feb' …) AND `month` ('YYYY-MM').
  // Previous bug: code called formatMonth(b.label) — 'Jan'.split('-')
  // returned ['Jan'], so parseInt(m, 10) on 'Jan' was NaN and the
  // fallback index was always 0 → every column showed 'Jan'.
  //
  // Fix: always derive the short name from `b.month` ('YYYY-MM') or
  // fall back to `b.label` only if it already looks like 'Jan'.
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatLabel(bucket, showYear = false) {
    // Prefer the ISO month string ('2026-03' → index 2 → 'Mar')
    const ym = bucket.month;
    if (ym && ym.includes('-')) {
      const parts = ym.split('-');
      const monthIdx = parseInt(parts[1], 10) - 1;
      const shortName = MONTH_SHORT[monthIdx] || '?';
      if (showYear && parts[0]) {
        return `${shortName} '${parts[0].slice(2)}`;   // e.g. "Mar '26"
      }
      return shortName;
    }
    // Fallback: the label is already a short name (and looks like one)
    return bucket.label || '?';
  }

  // Whether to show year suffix (when the trend spans >1 calendar year)
  const years = new Set(
    trend.map((b) => (b.month || '').split('-')[0]).filter(Boolean)
  );
  const showYear = years.size > 1;

  // ── Value extraction ───────────────────────────────────────────────
  function getValue(bucket) {
    if (valueKey && bucket[valueKey] != null) return bucket[valueKey];
    // Auto-detect: prefer newMembers, then value, then total, then sum
    if (bucket.newMembers != null) return bucket.newMembers;
    if (bucket.value != null) return bucket.value;
    if (bucket.total != null) return bucket.total;
    return (bucket.meetings || 0) + (bucket.activities || 0);
  }

  const values = trend.map(getValue);
  const max = Math.max(...values, 1);

  // ── Column width (wider when scrollable for readability) ───────────
  const COL_MIN_W = scrollable ? 46 : undefined;

  const barsContent = (
    <View style={[styles.barsContainer, { height }, scrollable && { minWidth: trend.length * 50 }]}>
      {trend.map((bucket, i) => {
        const val = values[i];
        const heightPct = Math.max(6, Math.round((val / max) * 100));
        const label = formatLabel(bucket, showYear);

        return (
          <View
            key={`${bucket.month || i}-${i}`}
            style={[styles.col, COL_MIN_W ? { minWidth: COL_MIN_W } : { flex: 1 }]}
          >
            <Text style={styles.colVal} numberOfLines={1}>{val}</Text>
            <View style={[styles.track, { backgroundColor: trackColor }]}>
              <View
                style={[
                  styles.fill,
                  {
                    height: `${heightPct}%`,
                    backgroundColor: barColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.colLabel} numberOfLines={1}>{label}</Text>
          </View>
        );
      })}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: Spacing.sm }}
      >
        {barsContent}
      </ScrollView>
    );
  }

  return barsContent;
}

const styles = StyleSheet.create({
  empty: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: 20,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 12,
    gap: 4,
  },
  col: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  colVal: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 3,
  },
  track: {
    width: '100%',
    maxWidth: 28,
    flex: 1,
    borderRadius: Radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    borderRadius: Radius.sm,
  },
  colLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
});
