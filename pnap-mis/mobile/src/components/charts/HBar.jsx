import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize } from '../../constants/colors';

export default function HBar({ rows, accent = Colors.primary, emptyLabel = 'No data.' }) {
  if (!rows || rows.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  const max = Math.max(...rows.map((r) => r.value || 0), 1);

  return (
    <View style={styles.container}>
      {rows.map((r, i) => {
        const pct = Math.round(((r.value || 0) / max) * 100);
        return (
          <View key={r.label || i} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>{r.label}</Text>
            
            <View style={styles.track}>
              <View 
                style={[
                  styles.bar, 
                  { 
                    width: `${pct}%`, 
                    backgroundColor: r.color || accent 
                  }
                ]} 
              />
            </View>

            <Text style={styles.value}>{r.value || 0}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  empty: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    width: 85,
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  track: {
    flex: 1,
    height: 12,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 6,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 6,
  },
  value: {
    minWidth: 32,
    textAlign: 'right',
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.xs,
  }
});
