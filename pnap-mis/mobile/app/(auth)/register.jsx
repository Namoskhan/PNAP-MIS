import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { api, errorMessage } from '../../src/api/client';
import { formatCnic, isCompleteCnic } from '../../src/utils/formatters';
import { useToast } from '../../src/components/Toast';
import DatePicker from '../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';

const GENDERS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'PREFER_NOT_TO_SAY' },
];

export default function RegisterScreen() {
  const router = useRouter();
  const toast = useToast();

  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [areaId, setAreaId] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    fatherOrHusbandName: '',
    cnic: '',
    phone: '',
    email: '',
    password: '',
    passwordConfirm: '',
    dateOfBirth: '2000-01-01',
    gender: 'MALE',
    address: '',
    basicUnitId: '',
  });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Load Provinces
  useEffect(() => {
    api.get('/public/provinces')
      .then((r) => setProvinces(r.data?.data || []))
      .catch(() => {});
  }, []);

  // Load Districts on Province change
  useEffect(() => {
    if (!provinceId) { setDistricts([]); setDistrictId(''); return; }
    api.get('/public/districts', { params: { provinceId } })
      .then((r) => setDistricts(r.data?.data || []))
      .catch(() => {});
  }, [provinceId]);

  // Load Areas on District change
  useEffect(() => {
    if (!districtId) { setAreas([]); setAreaId(''); return; }
    api.get('/public/areas', { params: { districtId } })
      .then((r) => setAreas(r.data?.data || []))
      .catch(() => {});
  }, [districtId]);

  // Load Basic Units on Area change
  useEffect(() => {
    if (!areaId) { setUnits([]); setForm((f) => ({ ...f, basicUnitId: '' })); return; }
    api.get('/public/basic-units', { params: { areaId } })
      .then((r) => setUnits(r.data?.data || []))
      .catch(() => {});
  }, [areaId]);

  async function handleRegister() {
    if (!form.fullName.trim() || !form.fatherOrHusbandName.trim() || !form.cnic || !form.phone || !form.email || !form.basicUnitId) {
      setErr('Please fill in all required fields (marked *).');
      return;
    }
    if (!isCompleteCnic(form.cnic)) {
      setErr('Please enter a valid 13-digit CNIC.');
      return;
    }
    if (form.password && form.password.length < 6) {
      setErr('Password must be at least 6 characters.');
      return;
    }
    if (form.password && form.password !== form.passwordConfirm) {
      setErr('Passwords do not match.');
      return;
    }

    setErr('');
    setBusy(true);
    try {
      await api.post('/public/register', {
        fullName: form.fullName.trim(),
        fatherOrHusbandName: form.fatherOrHusbandName.trim(),
        cnic: form.cnic,
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        address: form.address.trim() || 'Not specified',
        basicUnitId: form.basicUnitId,
      });
      setSubmitted(true);
      toast.success('Registration submitted for approval!');
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.successTitle}>Application Submitted!</Text>
          <Text style={styles.successText}>
            Your membership application has been received and is pending approval by your unit secretary.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/login')}>
            <Text style={styles.btnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Member Registration</Text>
            <Text style={styles.headerSub}>Join PNAP as a registered party member</Text>
          </View>

          <View style={styles.card}>
            {err ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{err}</Text>
              </View>
            ) : null}

            {/* Personal Details */}
            <Text style={styles.sectionHeader}>Personal Info</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={form.fullName}
                onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))}
                placeholder="Full Name"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Father / Husband Name *</Text>
              <TextInput
                style={styles.input}
                value={form.fatherOrHusbandName}
                onChangeText={(v) => setForm((f) => ({ ...f, fatherOrHusbandName: v }))}
                placeholder="Father or Husband Name"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>CNIC *</Text>
              <TextInput
                style={styles.input}
                value={form.cnic}
                onChangeText={(v) => setForm((f) => ({ ...f, cnic: formatCnic(v) }))}
                placeholder="XXXXX-XXXXXXX-X"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
                maxLength={15}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                placeholder="03XX-XXXXXXX"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="name@example.com"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.chipRow}>
                {GENDERS.map((g) => (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.chip, form.gender === g.value && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, gender: g.value }))}
                  >
                    <Text style={[styles.chipText, form.gender === g.value && styles.chipTextActive]}>
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <DatePicker
              label="Date of Birth *"
              value={form.dateOfBirth}
              onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
              placeholder="Select birth date"
              maxDate={new Date().toISOString().split('T')[0]}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.address}
                onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                placeholder="Residential Address"
                placeholderTextColor={Colors.textLight}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Unit Selection */}
            <Text style={[styles.sectionHeader, { marginTop: Spacing.lg }]}>Unit Assignment</Text>

            {/* Province picker */}
            <View style={styles.field}>
              <Text style={styles.label}>1. Province *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {provinces.map((p) => (
                  <TouchableOpacity
                    key={p._id}
                    style={[styles.chip, provinceId === p._id && styles.chipActive]}
                    onPress={() => setProvinceId(p._id)}
                  >
                    <Text style={[styles.chipText, provinceId === p._id && styles.chipTextActive]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* District picker */}
            {provinceId ? (
              <View style={styles.field}>
                <Text style={styles.label}>2. District *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {districts.map((d) => (
                    <TouchableOpacity
                      key={d._id}
                      style={[styles.chip, districtId === d._id && styles.chipActive]}
                      onPress={() => setDistrictId(d._id)}
                    >
                      <Text style={[styles.chipText, districtId === d._id && styles.chipTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Area picker */}
            {districtId ? (
              <View style={styles.field}>
                <Text style={styles.label}>3. Area *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {areas.map((a) => (
                    <TouchableOpacity
                      key={a._id}
                      style={[styles.chip, areaId === a._id && styles.chipActive]}
                      onPress={() => setAreaId(a._id)}
                    >
                      <Text style={[styles.chipText, areaId === a._id && styles.chipTextActive]}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Basic Unit picker */}
            {areaId ? (
              <View style={styles.field}>
                <Text style={styles.label}>4. Basic Unit *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {units.map((u) => (
                    <TouchableOpacity
                      key={u._id}
                      style={[styles.chip, form.basicUnitId === u._id && styles.chipActive]}
                      onPress={() => setForm((f) => ({ ...f, basicUnitId: u._id }))}
                    >
                      <Text style={[styles.chipText, form.basicUnitId === u._id && styles.chipTextActive]}>{u.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Password */}
            <Text style={[styles.sectionHeader, { marginTop: Spacing.lg }]}>Account Password</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Password (Optional)</Text>
              <TextInput
                style={styles.input}
                value={form.password}
                onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                placeholder="••••••••"
                placeholderTextColor={Colors.textLight}
                secureTextEntry
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={form.passwordConfirm}
                onChangeText={(v) => setForm((f) => ({ ...f, passwordConfirm: v }))}
                placeholder="••••••••"
                placeholderTextColor={Colors.textLight}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Submit Registration</Text>
              )}
            </TouchableOpacity>

            <Link href="/login" asChild>
              <TouchableOpacity style={styles.backBtn}>
                <Text style={styles.backBtnText}>Already have an account? <Text style={{ fontWeight: '700', color: Colors.primary }}>Sign In</Text></Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  formContainer: { padding: Spacing.lg, paddingBottom: 40 },
  header: { paddingVertical: Spacing.lg, alignItems: 'center' },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },
  sectionHeader: { fontSize: FontSize.base, fontWeight: '700', color: Colors.primaryDark, marginBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, paddingBottom: 6 },
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.text },
  multiline: { height: 60, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chipScroll: { flexDirection: 'row', marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt, marginRight: 8 },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  btn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.lg },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
  backBtn: { marginTop: Spacing.lg, alignItems: 'center' },
  backBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
  errorBanner: { backgroundColor: Colors.errorBg, borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.error + '30' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '500' },
  successContainer: { flex: 1, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl },
  successIcon: { fontSize: 64, marginBottom: Spacing.lg },
  successTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  successText: { fontSize: FontSize.base, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
});
