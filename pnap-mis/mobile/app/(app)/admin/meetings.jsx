import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { canManageEventConfig, isHigherAdmin } from '../../../src/utils/permissions';
import { useAuth } from '../../../src/context/AuthContext';
import { Picker } from '@react-native-picker/picker';

const STATUS_COLORS = {
  SCHEDULED: Colors.info,
  COMPLETED: Colors.success,
  CANCELLED: Colors.danger,
};

export default function MeetingsScreen() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  
  // Tabs: EXECUTIVE, GENERAL_BODY, COMMITTEE, CONGRESS, JIRGA
  // Determine available tabs based on context
  const availableTabs = useMemo(() => {
    const tabs = [];
    if (ctx?.unitLevel !== 'CENTRAL') {
      tabs.push({ id: 'EXECUTIVE', label: 'Executive' });
      tabs.push({ id: 'GENERAL_BODY', label: 'General Body' });
    } else {
      // Central has Congress, Jirga, Executive, Committee
      tabs.push({ id: 'EXECUTIVE', label: 'Executive' });
      tabs.push({ id: 'GENERAL_BODY', label: 'General Body' });
      tabs.push({ id: 'CONGRESS', label: 'Congress' });
      tabs.push({ id: 'JIRGA', label: 'Jirga' });
    }
    tabs.push({ id: 'COMMITTEE', label: 'Committee' });
    return tabs;
  }, [ctx?.unitLevel]);

  const [activeTab, setActiveTab] = useState(availableTabs[0].id);
  const fetchIdRef = useRef(0);

  async function getResolvedUnitId() {
    if (ctx?.unitLevel === 'CENTRAL' && ctx?.unitId === 'CENTRAL') {
      const res = await api.get('/org/central');
      return res.data?.data?._id;
    }
    return ctx?.unitId;
  }

  async function reload() {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setErr('');
    try {
      const resolvedUnitId = await getResolvedUnitId();
      if (!resolvedUnitId) {
        if (myId === fetchIdRef.current) setLoading(false);
        return;
      }
      
      const res = await api.get('/meetings', {
        params: { unitLevel: ctx?.unitLevel || 'CENTRAL', unitId: resolvedUnitId, body: activeTab },
      });
      if (myId === fetchIdRef.current) {
        setData(res.data.data || []);
      }
    } catch (e) {
      if (myId === fetchIdRef.current) {
        setErr(errorMessage(e));
      }
    } finally {
      if (myId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    // If the unit changes and current tab is not available, reset
    if (!availableTabs.find(t => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs]);

  useEffect(() => {
    reload();
  }, [ctx?.unitLevel, ctx?.unitId, activeTab]);

  function handleCancel(meeting) {
    Alert.alert(
      'Cancel Meeting',
      `Are you sure you want to cancel ${meeting.title || meeting.typeCode}?`,
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await api.patch(`/meetings/${meeting._id}`, { status: 'CANCELLED' });
              toast.success('Meeting cancelled.');
              reload();
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }
        },
      ]
    );
  }
  
  function handleFinalize(meeting) {
    // Stub for now. Full finalize logic requires fetching eligible attendees,
    // photos upload, and a complex form (handled on web).
    Alert.alert(
      'Finalize Meeting',
      'Finalizing meetings via the mobile app is not fully supported yet. Please use the web portal to attach photos and take detailed attendance.',
      [{ text: 'OK' }]
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {availableTabs.map(t => (
            <TouchableOpacity 
              key={t.id} 
              style={[styles.tab, activeTab === t.id && styles.activeTab]}
              onPress={() => setActiveTab(t.id)}
            >
              <Text style={[styles.tabText, activeTab === t.id && styles.activeTabText]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{availableTabs.find(t => t.id === activeTab)?.label} Meetings</Text>
          <TouchableOpacity style={styles.scheduleBtn} onPress={() => toast.info('Scheduling is only supported on web right now.')}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.scheduleBtnText}>Schedule</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : err ? (
          <Text style={styles.errorText}>{err}</Text>
        ) : data.length === 0 ? (
          <Text style={styles.emptyText}>No meetings found for this body.</Text>
        ) : (
          data.map(meeting => (
            <Card key={meeting._id} style={styles.meetingCard}>
              <View style={styles.meetingHeader}>
                <Text style={styles.meetingTitle}>{meeting.title || meeting.typeCode}</Text>
                <Badge 
                  text={meeting.status} 
                  color={STATUS_COLORS[meeting.status] || Colors.textMuted} 
                  variant="subtle" 
                />
              </View>

              <View style={styles.meetingDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.detailText}>
                    {new Date(meeting.startAt).toLocaleString()}
                  </Text>
                </View>
                {meeting.venue && (
                  <View style={styles.detailRow}>
                    <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
                    <Text style={styles.detailText}>{meeting.venue}</Text>
                  </View>
                )}
                {meeting.chairpersonId && (
                  <View style={styles.detailRow}>
                    <Ionicons name="person-outline" size={16} color={Colors.textMuted} />
                    <Text style={styles.detailText}>
                      Chair: {meeting.chairpersonId.fullName || 'Unknown'}
                    </Text>
                  </View>
                )}
              </View>

              {meeting.status === 'SCHEDULED' && (
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleFinalize(meeting)}>
                    <Text style={styles.actionBtnText}>Finalize</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleCancel(meeting)}>
                    <Text style={styles.actionBtnDangerText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabsScroll: {
    paddingHorizontal: Spacing.m,
    paddingVertical: Spacing.s,
    flexDirection: 'row',
    gap: Spacing.s,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeTab: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
  scrollContent: {
    padding: Spacing.m,
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.m,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.m,
    gap: 4,
  },
  scheduleBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  errorText: {
    color: Colors.danger,
    textAlign: 'center',
    marginTop: Spacing.l,
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.l,
  },
  meetingCard: {
    marginBottom: Spacing.m,
  },
  meetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.s,
  },
  meetingTitle: {
    fontSize: FontSize.m,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    marginRight: Spacing.s,
  },
  meetingDetails: {
    gap: 6,
    marginBottom: Spacing.m,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.s,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.s,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.s,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
  },
  actionBtnDanger: {
    borderColor: Colors.danger,
    backgroundColor: '#fee2e2',
  },
  actionBtnDangerText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
  },
});
