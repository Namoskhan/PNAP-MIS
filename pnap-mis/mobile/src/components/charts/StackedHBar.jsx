import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing } from '../../constants/colors';

export default function StackedHBar({
  rows,
  series,
  emptyLabel = 'No data.',
}) {
  if (!rows || rows.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  const totalOf = (r) => series.reduce((s, x) => s + (r.values[x.key] || 0), 0);
  const max = Math.max(...rows.map(totalOf), 1);

  return (
    <View style={styles.container}>
      {/* Legend */}
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Rows */}
      <View style={styles.rows}>
        {rows.map((r, i) => {
          const total = totalOf(r);
          const scale = (total / max) * 100;

          return (
            <View key={r.label || i} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={1}>{r.label}</Text>
              
              <View style={styles.track}>
                <View style={[styles.stack, { width: `${Math.max(scale, total > 0 ? 2 : 0)}%` }]}>
                  {series.map((s) => {
                    const v = r.values[s.key] || 0;
                    if (v <= 0) return null;
                    const widthPct = (v / total) * 100;

                    return (
                      <View
                        key={s.key}
                        style={[
                          styles.segment,
                          { width: `${widthPct}%`, backgroundColor: s.color }
                        ]}
                      >
                        {widthPct > 15 && (
                          <Text style={styles.segText} numberOfLines={1}>{v}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.totalBlock}>
                <Text style={styles.totalVal}>{total.toLocaleString()}</Text>
                {r.note != null && r.note > 0 && (
                  <Text style={styles.noteVal}>+{r.note.toLocaleString()}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  empty: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    width: 80,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  track: {
    flex: 1,
    height: 16,
  },
  stack: {
    flexDirection: 'row',
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  segText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  totalBlock: {
    width: 45,
    alignItems: 'flex-end',
  },
  totalVal: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  noteVal: {
    fontSize: FontSize.xs - 1,
    color: Colors.success,
    fontWeight: '600',
  },
});
