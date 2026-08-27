import React, { useState } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { Colors, FontSize, Radius } from '../constants/colors';
import { resolveMediaUrl } from '../api/client';

/**
 * User avatar — shows member photo or initials with colored background.
 * Props: name (string), size (number), color (bg color), photoUrl (string)
 */
export default function Avatar({ name, size = 40, color, photoUrl }) {
  const [imgError, setImgError] = useState(false);
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const bg = color || Colors.primary;
  const fontSize = Math.round(size * 0.38);
  const resolvedPhoto = resolveMediaUrl(photoUrl);

  if (resolvedPhoto && !imgError) {
    return (
      <Image
        source={{ uri: resolvedPhoto }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: Colors.border || '#cbd5e1',
          backgroundColor: '#e2e8f0',
        }}
        onError={() => setImgError(true)}
      />
    );
  }

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
