import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

const DEFAULT_PALETTE = ['#172554', '#1e40af', '#2563eb', '#3b82f6', '#93c5fd', '#bfdbfe'];

/**
 * PieChart component for mobile.
 * Visualizes segmented category shares with proportion bars and legend list.
 * segments: [{ label, value, color? }]
 */
export default function PieChart({
  segments = [],
  palette = DEFAULT_PALETTE,
  emptyLabel = 'No data to chart.',
}) {
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);

  if (!segments || segments.length === 0 || total === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.container}>
      {/* Composite Segment Bar */}
      <View style={styles.compositeBar}>
        {segments.map((seg, i) => {
          const val = seg.value || 0;
          if (val <= 0) return null;
          const pct = (val / total) * 100;
          const color = seg.color || palette[i % palette.length];

          return (
            <View
              key={i}
              style={[
                styles.segmentSlice,
                {
                  width: `${pct}%`,
                  backgroundColor: color,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Legend & Percentage Breakdown */}
      <View style={styles.legendGrid}>
        {segments.map((seg, i) => {
          const val = seg.value || 0;
          const pct = Math.round((val / total) * 100);
          const color = seg.color || palette[i % palette.length];

          return (
            <View key={i} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={styles.segLabel} numberOfLines={1}>
                {seg.label}
              </Text>
              <Text style={styles.segCount}>{val}</Text>
              <Text style={styles.segPct}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  empty: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    paddingVertical: 12,
  },
  compositeBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  segmentSlice: {
    height: '100%',
  },
  legendGrid: {
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  segLabel: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.text,
  },
  segCount: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  segPct: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    width: 32,
    textAlign: 'right',
  },
});
