import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

/**
 * AreaTrendChart component for mobile.
 * Visualizes 6 months of organizational meetings + activities trend.
 */
export default function AreaTrendChart({
  trend = [],
  height = 120,
  barColor = '#1e40af',
  trackColor = '#eff6ff',
}) {
  if (!trend || trend.length === 0) {
    return <Text style={styles.empty}>Not enough trend data.</Text>;
  }

  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function formatMonth(ym) {
    if (!ym) return '';
    const [, m] = ym.split('-');
    return MONTH_SHORT[(parseInt(m, 10) || 1) - 1] || '';
  }

  const totals = trend.map((b) => (b.meetings || 0) + (b.activities || 0));
  const max = Math.max(...totals, 1);

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.barsContainer}>
        {trend.map((bucket, i) => {
          const total = (bucket.meetings || 0) + (bucket.activities || 0);
          const heightPct = Math.max(6, Math.round((total / max) * 100));

          return (
            <View key={`${bucket.month || 'm'}-${i}`} style={styles.col}>
              <Text style={styles.colVal}>{total}</Text>
              
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

              <Text style={styles.colLabel}>{formatMonth(bucket.month)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'flex-end',
    paddingTop: 12,
  },
  empty: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: 20,
  },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  colVal: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  track: {
    width: '100%',
    maxWidth: 24,
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
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 6,
  },
});
