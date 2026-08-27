import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize } from '../../constants/colors';

/**
 * Donut chart component for mobile.
 * Displays a circular percentage indicator with center percentage and label.
 */
export default function Donut({
  percent = 0,
  label = 'filled',
  size = 90,
  stroke = 10,
  color = '#1e40af',
  trackColor = '#eff6ff',
}) {
  const v = Math.max(0, Math.min(100, Math.round(percent || 0)));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background ring */}
      <View
        style={[
          styles.outerRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: trackColor,
          },
        ]}
      />

      {/* Segmented progress ring representation */}
      <View
        style={[
          styles.progressRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: color,
            borderTopColor: v >= 25 ? color : 'transparent',
            borderRightColor: v >= 50 ? color : 'transparent',
            borderBottomColor: v >= 75 ? color : 'transparent',
            borderLeftColor: v >= 90 ? color : 'transparent',
            transform: [{ rotate: `${Math.round((v / 100) * 360)}deg` }],
          },
        ]}
      />

      {/* Center text container */}
      <View style={styles.centerContent}>
        <Text style={[styles.pctText, { color, fontSize: size * 0.2 }]}>{v}%</Text>
        {label ? (
          <Text style={[styles.labelText, { fontSize: Math.max(size * 0.11, 9) }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  outerRing: {
    position: 'absolute',
  },
  progressRing: {
    position: 'absolute',
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pctText: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  labelText: {
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 1,
    textTransform: 'uppercase',
  },
});
