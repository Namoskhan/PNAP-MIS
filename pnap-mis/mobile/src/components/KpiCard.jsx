import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

/**
 * KPI stat tile — matches web SmartKpi.
 * Props: label, value, sublabel, color, icon (string emoji or text)
 */
export default function KpiCard({ label, value, sublabel, color, icon }) {
  const accentColor = color || Colors.primary;
  return (
    <View style={[styles.card, { borderTopColor: accentColor }]}>
      <View style={styles.row}>
        {icon ? <Text style={[styles.icon, { color: accentColor }]}>{icon}</Text> : null}
        <Text style={[styles.value, { color: accentColor }]}>{value ?? '—'}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderTopWidth: 3,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  icon: {
    fontSize: FontSize.lg,
    marginBottom: 2,
  },
  value: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    lineHeight: 28,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sublabel: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
    marginTop: 2,
  },
});
