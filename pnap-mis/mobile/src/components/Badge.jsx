import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

const STATUS_STYLES = {
  ACTIVE: { bg: Colors.successBg, text: Colors.success },
  PENDING_APPROVAL: { bg: Colors.warningBg, text: Colors.warning },
  PENDING: { bg: Colors.warningBg, text: Colors.warning },
  APPROVED: { bg: Colors.successBg, text: Colors.success },
  REJECTED: { bg: Colors.errorBg, text: Colors.error },
  INACTIVE: { bg: '#f1f5f9', text: Colors.textMuted },
  SUSPENDED: { bg: '#f3e8ff', text: '#7c3aed' },
  DRAFT: { bg: '#f1f5f9', text: Colors.textMuted },
};

export default function Badge({ label, status, color, bg, style }) {
  const preset = status ? STATUS_STYLES[status] : null;
  const bgColor = bg || preset?.bg || Colors.infoBg;
  const textColor = color || preset?.text || Colors.info;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, style]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
