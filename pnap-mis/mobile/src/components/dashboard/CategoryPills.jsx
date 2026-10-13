import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

/**
 * CategoryPills Component
 * Horizontal, touch-friendly tab pills with crisp vector icons (from the Ionicons family)
 * [ All Overview ] [ Units & Branches ] [ Members ] [ Meetings & Field ] [ Needs Attention ]
 */
export default function CategoryPills({
  activeTab = 'all',
  onSelectTab,
  counts = {},
  isRTL = false,
  t,
}) {
  const tabs = [
    {
      key: 'all',
      iconName: 'globe-outline',
      iconActiveName: 'globe',
      label: t('common.all', 'All Overview'),
    },
    {
      key: 'units',
      iconName: 'business-outline',
      iconActiveName: 'business',
      label: t('commandCenter.tabUnits', 'Units & Branches'),
      count: counts.units ? String(counts.units) : null,
    },
    {
      key: 'members',
      iconName: 'people-outline',
      iconActiveName: 'people',
      label: t('commandCenter.tabMembers', 'Members'),
      count: counts.members ? String(counts.members) : null,
    },
    {
      key: 'governance',
      iconName: 'calendar-outline',
      iconActiveName: 'calendar',
      label: t('commandCenter.tabGovernance', 'Meetings & Field'),
      count: counts.meetings ? String(counts.meetings) : null,
    },
    {
      key: 'alerts',
      iconName: 'alert-circle-outline',
      iconActiveName: 'alert-circle',
      label: t('commandCenter.tabAlerts', 'Needs Attention'),
      count: counts.alerts ? String(counts.alerts) : null,
      isAlert: true,
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isRTL && { flexDirection: 'row-reverse' }]}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const iconColor = isActive
            ? '#ffffff'
            : tab.isAlert && tab.count
            ? '#d97706'
            : '#475569';

          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.pill,
                isActive ? styles.pillActive : styles.pillInactive,
                tab.isAlert && !isActive && tab.count && styles.pillAlert,
                isRTL && { flexDirection: 'row-reverse' },
              ]}
              activeOpacity={0.7}
              onPress={() => onSelectTab(tab.key)}
            >
              <Ionicons
                name={isActive ? tab.iconActiveName : tab.iconName}
                size={15}
                color={iconColor}
              />
              <Text
                style={[
                  styles.pillLabel,
                  isActive ? styles.pillLabelActive : styles.pillLabelInactive,
                  tab.isAlert && !isActive && tab.count ? styles.pillAlertText : null,
                ]}
              >
                {tab.label}
              </Text>

              {tab.count ? (
                <View
                  style={[
                    styles.countBadge,
                    isActive ? styles.countBadgeActive : styles.countBadgeInactive,
                    tab.isAlert ? styles.countBadgeAlert : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      isActive ? styles.countTextActive : styles.countTextInactive,
                      tab.isAlert && !isActive ? { color: Colors.warning || '#d97706' } : null,
                    ]}
                  >
                    {tab.count}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md || 14,
  },
  scrollContent: {
    paddingHorizontal: 2,
    gap: 8,
    flexDirection: 'row',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
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
  pillActive: {
    backgroundColor: Colors.primary || '#1e40af',
    borderColor: Colors.primary || '#1e40af',
  },
  pillInactive: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  pillAlert: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  pillLabelActive: {
    color: '#ffffff',
  },
  pillLabelInactive: {
    color: '#334155',
  },
  pillAlertText: {
    color: '#b45309',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countBadgeInactive: {
    backgroundColor: '#f1f5f9',
  },
  countBadgeAlert: {
    backgroundColor: 'rgba(217, 119, 6, 0.15)',
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
  },
  countTextActive: {
    color: '#ffffff',
  },
  countTextInactive: {
    color: '#64748b',
  },
});
