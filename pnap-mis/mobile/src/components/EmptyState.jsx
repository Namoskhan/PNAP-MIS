import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../constants/colors';

export default function EmptyState({ icon = '📭', title = 'Nothing here', subtitle, message }) {
  const isIonicons = typeof icon === 'string' && (icon.includes('-outline') || icon.includes('-sharp'));
  const textSub = subtitle || message;

  return (
    <View style={styles.container}>
      {typeof icon !== 'string' ? (
        icon
      ) : isIonicons ? (
        <Ionicons name={icon} size={48} color={Colors.textMuted} style={styles.iconIonicons} />
      ) : (
        <Text style={styles.icon}>{icon}</Text>
      )}
      <Text style={styles.title}>{title}</Text>
      {textSub ? <Text style={styles.subtitle}>{textSub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: Spacing.xl,
  },
  icon: {
    fontSize: 48,
    marginBottom: Spacing.lg,
  },
  iconIonicons: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
