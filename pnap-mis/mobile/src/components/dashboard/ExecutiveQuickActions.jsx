import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

/**
 * ExecutiveQuickActions Component
 * Clean, minimalist 4-button quick action tiles.
 * Stripped of all redundant subtitles and micro-copy.
 */
export default function ExecutiveQuickActions({
  pendingApprovals = 0,
  isRTL = false,
  t,
}) {
  const router = useRouter();

  const actions = [
    {
      key: 'approvals',
      iconName: 'hourglass-outline',
      iconColor: '#d97706',
      title: t('nav.pendingRoleApprovals', 'Approvals'),
      badge: pendingApprovals > 0 ? pendingApprovals : null,
      badgeColor: '#dc2626',
      bg: '#fffbeb',
      border: '#fde68a',
      onPress: () => router.push('/admin/pending-approvals'),
    },
    {
      key: 'directory',
      iconName: 'people-outline',
      iconColor: '#16a34a',
      title: t('nav.allMembers', 'Roster'),
      bg: '#f0fdf4',
      border: '#bbf7d0',
      onPress: () => router.push('/members'),
    },
    {
      key: 'notices',
      iconName: 'megaphone-outline',
      iconColor: '#7c3aed',
      title: t('nav.announcements', 'Circulars'),
      bg: '#faf5ff',
      border: '#e9d5ff',
      onPress: () => router.push('/announcements'),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.actionsRow, isRTL && { flexDirection: 'row-reverse' }]}>
        {actions.map((act) => (
          <TouchableOpacity
            key={act.key}
            style={[styles.actionBtn, { backgroundColor: act.bg, borderColor: act.border }]}
            activeOpacity={0.75}
            onPress={act.onPress}
          >
            {/* Notification Badge */}
            {act.badge ? (
              <View style={[styles.badge, { backgroundColor: act.badgeColor }]}>
                <Text style={styles.badgeText}>{act.badge}</Text>
              </View>
            ) : null}

            <View style={styles.iconCircle}>
              <Ionicons name={act.iconName} size={20} color={act.iconColor} />
            </View>

            <Text style={styles.actionTitle} numberOfLines={1}>
              {act.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md || 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    zIndex: 10,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#ffffff',
  },
});
