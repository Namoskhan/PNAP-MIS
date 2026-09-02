import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

/**
 * PctBar component for threshold progress metrics.
 * Displays label, percentage, and a rounded progress bar with threshold color logic.
 */
export default function PctBar({
  value,
  label,
  threshold = 60,
  dangerColor = Colors.error,
  goodColor = Colors.success,
}) {
  const v = value == null ? null : Math.max(0, Math.min(100, Math.round(value)));
  const isLow = v != null && v < threshold;
  const barColor = v == null ? Colors.textMuted : isLow ? dangerColor : goodColor;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Text style={[styles.val, { color: barColor }]}>
          {v == null ? '—' : `${v}%`}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${v || 0}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    flex: 1,
  },
  val: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  track: {
    height: 8,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
});
