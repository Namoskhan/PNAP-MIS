import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

/**
 * VBars chart component for mobile.
 * Displays vertical comparison bars with value badges and labels.
 * rows: [{ label, value, total?, color? }]
 */
export default function VBars({
  rows = [],
  height = 110,
  color = '#1e40af',
  trackColor = '#eff6ff',
  emptyLabel = 'No data.',
  showLabels = true,
  horizontalScroll = false,
}) {
  if (!rows || rows.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  const max = Math.max(...rows.map((r) => Math.max(r.total || 0, r.value || 0)), 1);

  const content = (
    <View style={[styles.chartBody, { height }]}>
      {rows.map((r, i) => {
        const val = r.value || 0;
        const valPct = Math.max(4, Math.round((val / max) * 100));
        const barColor = r.color || color;

        return (
          <View key={i} style={styles.col}>
            {/* Value label */}
            <Text style={[styles.valText, { color: barColor }]} numberOfLines={1}>
              {val > 999 ? `${(val / 1000).toFixed(1)}k` : val}
            </Text>

            {/* Bar Track */}
            <View style={[styles.barTrack, { backgroundColor: trackColor }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    height: `${valPct}%`,
                    backgroundColor: barColor,
                  },
                ]}
              />
            </View>

            {/* Category Label */}
            {showLabels && (
              <Text style={styles.catLabel} numberOfLines={1}>
                {r.label}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );

  if (horizontalScroll && rows.length > 5) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
        {content}
      </ScrollView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  empty: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    paddingVertical: 16,
    textAlign: 'center',
  },
  chartBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 18,
    paddingBottom: 4,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  valText: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  barTrack: {
    width: '100%',
    maxWidth: 32,
    flex: 1,
    borderRadius: Radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: Radius.sm,
  },
  catLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
});
