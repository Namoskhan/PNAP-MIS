import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing, Radius } from '../../constants/colors';

/**
 * SmartKpi component for mobile dashboards.
 * Displays an icon, label, main value (with custom formatter), and a mini sparkline trend.
 */
export default function SmartKpi({
  label,
  value,
  icon,
  iconBg = '#eff6ff',
  iconColor = '#1e40af',
  spark = [],
  sparkColor = '#1e40af',
  format,
  subLabel,
}) {
  const displayVal = format ? format(value) : (value != null ? value.toLocaleString() : '—');

  // Calculate sparkline bars
  const max = Math.max(...(spark.length ? spark : [1]), 1);
  const min = Math.min(...(spark.length ? spark : [0]), 0);
  const range = max - min || 1;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        {icon && (
          <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
            <Text style={[styles.iconText, { color: iconColor }]}>{icon}</Text>
          </View>
        )}
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </View>

      <Text style={styles.value} numberOfLines={1}>{displayVal}</Text>
      {subLabel && <Text style={styles.subLabel} numberOfLines={1}>{subLabel}</Text>}

      {spark && spark.length > 1 && (
        <View style={styles.sparkContainer}>
          {spark.map((v, i) => {
            const hPct = Math.max(15, Math.min(100, Math.round(((v - min) / range) * 100)));
            const isLast = i === spark.length - 1;
            return (
              <View key={i} style={styles.sparkTrack}>
                <View
                  style={[
                    styles.sparkBar,
                    {
                      height: `${hPct}%`,
                      backgroundColor: isLast ? sparkColor : 'rgba(30,64,175,0.25)',
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 14,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    flex: 1,
  },
  value: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subLabel: {
    fontSize: FontSize.xs - 1,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sparkContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 24,
    gap: 3,
    marginTop: 10,
  },
  sparkTrack: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  sparkBar: {
    width: '100%',
    borderRadius: 2,
  },
});
