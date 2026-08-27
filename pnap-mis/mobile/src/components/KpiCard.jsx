import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

/**
 * KPI stat tile — matches web SmartKpi with responsive layout.
 * Props: label, value, sublabel, color, icon (string emoji or text)
 */
export default function KpiCard({ label, value, sublabel, color, icon }) {
  const accentColor = color || Colors.primary;
  return (
    <View style={[styles.card, { borderTopColor: accentColor }]}>
      <View style={styles.row}>
        {icon ? <Text style={[styles.icon, { color: accentColor }]}>{icon}</Text> : null}
        <Text 
          style={[styles.value, { color: accentColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {value ?? '—'}
        </Text>
      </View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {sublabel ? <Text style={styles.sublabel} numberOfLines={1}>{sublabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 130,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderTopWidth: 3,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.borderLight || '#f1f5f9',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  icon: {
    fontSize: FontSize.lg,
  },
  value: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    flex: 1,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sublabel: {
    fontSize: FontSize.xs - 1,
    color: Colors.textLight,
    marginTop: 2,
  },
});

