import { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePickerNative from '@react-native-community/datetimepicker';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

export default function DateTimePicker({
  label,
  value,
  mode = 'datetime', // 'date', 'time', 'datetime'
  onChange,
  placeholder,
  style,
}) {
  const [show, setShow] = useState(false);

  const dateValue = value ? new Date(value) : new Date();

  function handleChange(event, selectedDate) {
    if (Platform.OS === 'android') {
      setShow(false);
    }
    if (event.type === 'set' && selectedDate) {
      onChange(selectedDate.toISOString());
    }
  }

  // Display formatting
  let displayValue = placeholder || 'Select...';
  if (value) {
    const d = new Date(value);
    if (mode === 'date') displayValue = d.toLocaleDateString();
    else if (mode === 'time') displayValue = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    else displayValue = d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  }

  if (Platform.OS === 'web') {
    // Basic fallback for web testing in Expo
    return (
      <View style={[styles.container, style]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <input
          type={mode === 'datetime' ? 'datetime-local' : mode}
          value={value ? (mode === 'datetime' ? value.slice(0, 16) : value.slice(0, 10)) : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v) {
              const d = new Date(v);
              onChange(d.toISOString());
            } else {
              onChange('');
            }
          }}
          style={{
            width: '100%',
            height: 44,
            padding: '8px 12px',
            borderRadius: 10,
            border: `1.5px solid ${Colors.border}`,
            backgroundColor: Colors.surface,
            color: value ? Colors.text : Colors.textMuted,
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

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      
      {Platform.OS === 'ios' ? (
        <View style={styles.pickerButton}>
          <DateTimePickerNative
            value={dateValue}
            mode={mode}
            display="default"
            onChange={handleChange}
            style={{ width: '100%', alignSelf: 'flex-start' }}
          />
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShow(true)}
            activeOpacity={0.75}
          >
            <Text style={[styles.pickerText, !value && styles.placeholderText]}>
              {displayValue}
            </Text>
          </TouchableOpacity>
          {show && (
            <DateTimePickerNative
              value={dateValue}
              mode={mode}
              is24Hour={false}
              display="default"
              onChange={handleChange}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  pickerText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1 },
  placeholderText: { color: Colors.textLight },
});
