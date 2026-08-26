import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Radius } from '../constants/colors';

/**
 * User avatar — shows initials with a colored background.
 * Props: name (string), size (number), color (bg color)
 */
export default function Avatar({ name, size = 40, color }) {
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const bg = color || Colors.primary;
  const fontSize = Math.round(size * 0.38);

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.initials, { fontSize }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
