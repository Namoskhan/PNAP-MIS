import { useState } from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';
import { shortDate } from '../utils/formatters';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DatePicker({
  label,
  value, // string 'YYYY-MM-DD' or ISO
  onChange,
  placeholder = 'Select date',
  minDate,
  maxDate,
  style,
}) {
  const [open, setOpen] = useState(false);

  // Normalize initial date
  const parsed = value ? new Date(value) : new Date();
  const validDate = isNaN(parsed.getTime()) ? new Date() : parsed;

  const [currentYear, setCurrentYear] = useState(validDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(validDate.getMonth());

  // Format value for display
  const dateStr = value ? (value.includes('T') ? value.split('T')[0] : value) : '';
  const displayLabel = dateStr ? shortDate(dateStr) : placeholder;

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <input
          type="date"
          value={dateStr}
          onChange={(e) => onChange(e.target.value)}
          min={minDate}
          max={maxDate}
          style={{
            width: '100%',
            height: 44,
            padding: '8px 12px',
            borderRadius: 10,
            border: `1.5px solid ${Colors.border}`,
            backgroundColor: Colors.surface,
            color: dateStr ? Colors.text : Colors.textMuted,
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
            cursor: 'pointer',
          }}
        />
      </View>
    );
  }

  // Mobile Native Calendar Modal
  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  }

  function handleSelectDay(day) {
    const m = String(currentMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const selected = `${currentYear}-${m}-${d}`;
    onChange(selected);
    setOpen(false);
  }

  function handleSelectToday() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const selected = `${y}-${m}-${d}`;
    onChange(selected);
    setCurrentYear(y);
    setCurrentMonth(now.getMonth());
    setOpen(false);
  }

  function handlePrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.labelRow}>
        {label ? <Text style={styles.label}>{label}</Text> : <View />}
        <TouchableOpacity onPress={handleSelectToday} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>📅 Today</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={[styles.pickerText, !dateStr && styles.placeholderText]}>
          {displayLabel}
        </Text>
        <Text style={styles.calendarIcon}>📅</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.calendarCard}>
            {/* Header: Month / Year Navigation */}
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
                <Text style={styles.navBtnText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calTitle}>
                {MONTH_NAMES[currentMonth]} {currentYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
                <Text style={styles.navBtnText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Days of Week Header */}
            <View style={styles.daysRow}>
              {DAYS.map((d) => (
                <Text key={d} style={styles.dayOfWeekText}>{d}</Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.grid}>
              {blanks.map((b) => (
                <View key={`b-${b}`} style={styles.dayCell} />
              ))}
              {days.map((d) => {
                const curStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isSelected = curStr === dateStr;
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayCell, isSelected && styles.selectedDayCell]}
                    onPress={() => handleSelectDay(d)}
                  >
                    <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>
                      {d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: Spacing.md }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1, backgroundColor: Colors.primary }]} onPress={handleSelectToday}>
                <Text style={[styles.closeBtnText, { color: '#fff' }]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={() => setOpen(false)}>
                <Text style={styles.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  todayBtn: { paddingVertical: 2, paddingHorizontal: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 4 },
  todayBtnText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  pickerText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  placeholderText: { color: Colors.textLight },
  calendarIcon: { fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  calendarCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Platform.select({
      web: {
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 10,
      },
    }),
  },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  calTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  navBtn: { padding: Spacing.sm, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceAlt },
  navBtnText: { fontSize: 20, fontWeight: '700', color: Colors.text, lineHeight: 22 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.xs },
  dayOfWeekText: { width: 36, textAlign: 'center', fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  dayCell: { width: '14.28%', height: 38, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  selectedDayCell: { backgroundColor: Colors.primary, borderRadius: 19 },
  dayText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  selectedDayText: { color: '#fff', fontWeight: '700' },
  closeBtn: { marginTop: Spacing.lg, paddingVertical: 10, alignItems: 'center', backgroundColor: Colors.surfaceAlt, borderRadius: Radius.md },
  closeBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
});
