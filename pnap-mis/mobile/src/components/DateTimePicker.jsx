import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePickerNative, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';

function getLocalNowString(mode) {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  if (mode === 'date') {
    return `${YYYY}-${MM}-${DD}`;
  }
  if (mode === 'time') {
    return `${hh}:${mm}`;
  }
  return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
}

function toLocalDatetimeString(isoOrDateStr) {
  if (!isoOrDateStr) return '';
  if (typeof isoOrDateStr === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(isoOrDateStr) && !isoOrDateStr.endsWith('Z')) {
    return isoOrDateStr.slice(0, 16);
  }
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return '';
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
}

function toLocalDateString(isoOrDateStr) {
  if (!isoOrDateStr) return '';
  if (typeof isoOrDateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(isoOrDateStr)) {
    return isoOrDateStr.slice(0, 10);
  }
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return '';
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD}`;
}

function toLocalTimeString(isoOrDateStr) {
  if (!isoOrDateStr) return '';
  if (typeof isoOrDateStr === 'string' && /^\d{2}:\d{2}/.test(isoOrDateStr)) {
    return isoOrDateStr.slice(0, 5);
  }
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseLocalInput(v) {
  if (!v) return null;
  const [datePart, timePart] = v.split('T');
  if (!datePart) return null;
  const parts = datePart.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return null;
  const [year, month, day] = parts;
  let hours = 0, minutes = 0;
  if (timePart) {
    const tparts = timePart.split(':').map(Number);
    hours = tparts[0] || 0;
    minutes = tparts[1] || 0;
  }
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export default function DateTimePicker({
  label,
  value,
  mode = 'datetime', // 'date', 'time', 'datetime'
  onChange,
  placeholder,
  style,
}) {
<<<<<<< HEAD
  const dateValue = value && !isNaN(new Date(value).getTime()) ? new Date(value) : new Date();

  function showAndroidPicker() {
    if (Platform.OS !== 'android') return;

    if (mode === 'datetime') {
      DateTimePickerAndroid.open({
        value: dateValue,
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            const pickedDate = selectedDate;
            DateTimePickerAndroid.open({
              value: pickedDate,
              mode: 'time',
              is24Hour: false,
              onChange: (timeEvent, finalDate) => {
                if (timeEvent.type === 'set' && finalDate) {
                  const combined = new Date(pickedDate);
                  combined.setHours(finalDate.getHours(), finalDate.getMinutes(), 0, 0);
                  onChange(combined.toISOString());
                }
              },
            });
          }
        },
      });
    } else {
      DateTimePickerAndroid.open({
        value: dateValue,
        mode: mode === 'time' ? 'time' : 'date',
        is24Hour: false,
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            onChange(selectedDate.toISOString());
          }
        },
      });
=======
  const [show, setShow] = useState(false);
  const [androidMode, setAndroidMode] = useState('date');
  const [tempDate, setTempDate] = useState(null);

  const parsed = value ? (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !value.endsWith('Z') ? parseLocalInput(value) : new Date(value)) : new Date();
  const dateValue = (parsed && !isNaN(parsed.getTime())) ? parsed : new Date();

  function setNow() {
    onChange(getLocalNowString(mode));
  }

  function openPicker() {
    if (!value) {
      onChange(getLocalNowString(mode));
    }
    if (Platform.OS === 'android') {
      setTempDate(null);
      setAndroidMode(mode === 'time' ? 'time' : 'date');
    }
    setShow(true);
  }

  function handleChange(event, selectedDate) {
    if (event.type === 'dismissed') {
      setShow(false);
      setTempDate(null);
      return;
    }

    if (Platform.OS === 'android' && mode === 'datetime') {
      if (androidMode === 'date') {
        // Save selected date and immediately prompt for time
        setTempDate(selectedDate);
        setShow(false);
        setTimeout(() => {
          setAndroidMode('time');
          setShow(true);
        }, 120);
        return;
      } else if (androidMode === 'time') {
        const base = tempDate ? new Date(tempDate) : new Date(dateValue);
        base.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        setShow(false);
        setTempDate(null);
        const pad = (n) => String(n).padStart(2, '0');
        const localStr = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
        onChange(localStr);
        return;
      }
    }

    if (Platform.OS === 'android') {
      setShow(false);
    }
    if (selectedDate) {
      const pad = (n) => String(n).padStart(2, '0');
      if (mode === 'date') {
        onChange(`${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`);
      } else if (mode === 'time') {
        onChange(`${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}`);
      } else {
        onChange(`${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}T${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}`);
      }
>>>>>>> origin/Shumail
    }
  }

  // Display formatting (formatted in user's device local timezone with 12-hour AM/PM)
  let displayValue = placeholder || 'Select...';
  if (value) {
<<<<<<< HEAD
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      if (mode === 'date') displayValue = d.toLocaleDateString();
      else if (mode === 'time') displayValue = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      else displayValue = d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
=======
    const d = (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !value.endsWith('Z'))
      ? parseLocalInput(value)
      : new Date(value);

    if (d && !isNaN(d.getTime())) {
      if (mode === 'date') {
        displayValue = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
      } else if (mode === 'time') {
        displayValue = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      } else {
        displayValue = d.toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }
>>>>>>> origin/Shumail
    }
  }

  if (Platform.OS === 'web') {
    let inputType = 'datetime-local';
    let inputValue = '';
    if (mode === 'date') {
      inputType = 'date';
      inputValue = toLocalDateString(value);
    } else if (mode === 'time') {
      inputType = 'time';
      inputValue = toLocalTimeString(value);
    } else {
      inputType = 'datetime-local';
      inputValue = toLocalDatetimeString(value);
    }

    return (
      <View style={[styles.container, style]}>
        <View style={styles.labelRow}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          <TouchableOpacity onPress={setNow} style={styles.nowBtn}>
            <Text style={styles.nowBtnText}>⚡ Set to Now</Text>
          </TouchableOpacity>
        </View>
        <input
          type={inputType}
          value={inputValue}
          onFocus={() => {
            if (!value) {
              onChange(getLocalNowString(mode));
            }
          }}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v);
          }}
          style={{
            width: '100%',
            height: 44,
            padding: '8px 12px',
            borderRadius: 10,
            border: `1.5px solid ${Colors.border}`,
            backgroundColor: Colors.surface,
            color: inputValue ? Colors.text : Colors.textMuted,
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

  const activeNativeMode = Platform.OS === 'android' && mode === 'datetime' ? androidMode : mode;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.labelRow}>
        {label ? <Text style={styles.label}>{label}</Text> : <View />}
        <TouchableOpacity onPress={setNow} style={styles.nowBtn}>
          <Text style={styles.nowBtnText}>⚡ Set to Now</Text>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'ios' ? (
        <View style={styles.pickerButton}>
          <DateTimePickerNative
            value={dateValue}
            mode={mode}
            display="default"
            onChange={(event, selectedDate) => {
              if (selectedDate) onChange(selectedDate.toISOString());
            }}
            style={{ width: '100%', alignSelf: 'flex-start' }}
          />
        </View>
      ) : (
<<<<<<< HEAD
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={showAndroidPicker}
          activeOpacity={0.75}
        >
          <Text style={[styles.pickerText, !value && styles.placeholderText]}>
            {displayValue}
          </Text>
        </TouchableOpacity>
=======
        <>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={openPicker}
            activeOpacity={0.75}
          >
            <Text style={[styles.pickerText, !value && styles.placeholderText]}>
              {displayValue}
            </Text>
          </TouchableOpacity>
          {show && (
            <DateTimePickerNative
              value={dateValue}
              mode={activeNativeMode}
              is24Hour={false}
              display="default"
              onChange={handleChange}
            />
          )}
        </>
>>>>>>> origin/Shumail
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  nowBtn: { paddingVertical: 2, paddingHorizontal: 6, backgroundColor: Colors.surfaceAlt, borderRadius: 4 },
  nowBtnText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
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
