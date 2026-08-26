import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { api, errorMessage } from '../api/client';
import { useToast } from './Toast';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';
import Card from './Card';
import KpiCard from './KpiCard';
import Badge from './Badge';
import EmptyState from './EmptyState';
import MembershipAnalytics from './dashboard/MembershipAnalytics';
import CampaignsAnalytics from './dashboard/CampaignsAnalytics';
import MeetingsAnalytics from './dashboard/MeetingsAnalytics';

const num = (v) => (v ?? 0).toLocaleString();

export default function CommandCenter() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('MEMBERSHIP');

  const isSuperOrCentral = user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('CENTRAL_ADMIN') || !!user?.canViewExecutiveDashboard;

  if (!isSuperOrCentral) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="🛡️" title="Access Denied" subtitle="You do not have permission to view the Command Center." />
      </SafeAreaView>
    );
  }

  const TABS = [
    { key: 'MEMBERSHIP', label: 'Membership' },
    { key: 'CAMPAIGNS', label: 'Campaigns' },
    { key: 'MEETINGS', label: 'Meetings' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Banner */}
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>National Standing</Text>
          <Text style={styles.bannerSub}>Command Center</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Link href="/announcements" asChild>
            <TouchableOpacity style={styles.headerBtn}>
              <Text style={{ fontSize: 18 }}>📣</Text>
            </TouchableOpacity>
          </Link>
          <Link href="/notifications" asChild>
            <TouchableOpacity style={styles.headerBtn}>
              <Text style={{ fontSize: 18 }}>🔔</Text>
            </TouchableOpacity>
          </Link>
          <Badge label="Live" color="#fff" bg="rgba(255,255,255,0.2)" />
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity 
            key={t.key} 
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'MEMBERSHIP' && <MembershipAnalytics days={365} />}
        {tab === 'CAMPAIGNS' && <CampaignsAnalytics days={365} />}
        {tab === 'MEETINGS' && <MeetingsAnalytics days={365} />}
      </ScrollView>
    </SafeAreaView>
  );


}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  banner: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    paddingTop: Spacing.xl, // Extra padding since we removed it from safearea potentially
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  tabTextActive: {
    color: '#fff',
  }
});
