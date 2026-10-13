import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { Colors } from '../constants/colors';

/**
 * NotificationBell Component
 * Displays a sleek notification bell icon with an unread badge counter.
 * Adheres to iOS / Material Design top app-bar guidelines.
 */
export default function NotificationBell({ color = '#ffffff', size = 22, style }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isRTL } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      if (typeof res?.data?.data?.count === 'number') {
        setUnreadCount(res.data.data.count);
      }
    } catch {
      // offline or silent fail
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchUnread();

    // Periodic check every 35s to keep badge fresh
    const interval = setInterval(() => {
      if (mounted) fetchUnread();
    }, 35000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchUnread]);

  // Refresh count whenever returning from another screen
  useEffect(() => {
    if (pathname !== '/notifications') {
      fetchUnread();
    }
  }, [pathname, fetchUnread]);

  const handlePress = () => {
    if (pathname !== '/notifications') {
      router.push('/notifications');
    }
  };

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[
        styles.btn,
        isRTL ? styles.btnRTL : styles.btnLTR,
        style,
      ]}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
    >
      <Ionicons name="notifications-outline" size={size} color={color} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {badgeText}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  btnLTR: {
    marginRight: 10,
  },
  btnRTL: {
    marginLeft: 10,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.primary || '#1e3a8a',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.5,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 11,
  },
});
