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
import { useLanguage } from '../../src/context/LanguageContext';
import { formatCnic, isCompleteCnic } from '../../src/utils/formatters';
import { useToast } from '../../src/components/Toast';
import DatePicker from '../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';

const GENDERS = [
  { labelKey: 'common.male', fallback: 'Male', value: 'MALE' },
  { labelKey: 'common.female', fallback: 'Female', value: 'FEMALE' },
  { labelKey: 'common.other', fallback: 'Other', value: 'PREFER_NOT_TO_SAY' },
];

export default function RegisterScreen() {
  const { t, isRTL } = useLanguage();
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
      setErr(t('register.fillRequired', 'Please fill in all required fields (marked *).'));
      return;
    }
    if (!isCompleteCnic(form.cnic)) {
      setErr(t('register.validCnic', 'Please enter a valid 13-digit CNIC.'));
      return;
    }
    if (form.password && form.password.length < 6) {
      setErr(t('auth.errMin6Chars', 'Password must be at least 6 characters.'));
      return;
    }
    if (form.password && form.password !== form.passwordConfirm) {
      setErr(t('register.passwordsMismatch', 'Passwords do not match.'));
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
      toast.success(t('register.submittedSuccess', 'Registration submitted for approval!'));
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
          <Text style={styles.successTitle}>{t('register.applicationSubmitted', 'Application Submitted!')}</Text>
          <Text style={styles.successText}>
            {t('register.pendingSecretaryApproval', 'Your membership application has been received and is pending approval by your unit secretary.')}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.replace('/login')}>
            <Text style={styles.btnText}>{t('auth.backToSignIn', 'Back to Sign In')}</Text>
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
            <Text style={styles.headerTitle}>{t('register.memberRegistration', 'Member Registration')}</Text>
            <Text style={styles.headerSub}>{t('register.joinPnap', 'Join PNAP as a registered party member')}</Text>
          </View>

          <View style={styles.card}>
            {err ? (
              <View style={styles.errorBanner}>
                <Text style={[styles.errorText, isRTL && { textAlign: 'right' }]}>{err}</Text>
              </View>
            ) : null}

            {/* Personal Details */}
            <Text style={[styles.sectionHeader, isRTL && { textAlign: 'right' }]}>{t('register.personalInfo', 'Personal Info')}</Text>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.fullNameRequired', 'Full Name *')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.fullName}
                onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))}
                placeholder={t('register.fullName', 'Full Name')}
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.fatherOrHusbandRequired', 'Father / Husband Name *')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.fatherOrHusbandName}
                onChangeText={(v) => setForm((f) => ({ ...f, fatherOrHusbandName: v }))}
                placeholder={t('register.fatherOrHusband', 'Father or Husband Name')}
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.cnicRequired', 'CNIC *')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.cnic}
                onChangeText={(v) => setForm((f) => ({ ...f, cnic: formatCnic(v) }))}
                placeholder="XXXXX-XXXXXXX-X"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
                maxLength={15}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.phoneRequired', 'Phone Number *')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.phone}
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                placeholder="03XX-XXXXXXX"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.emailRequired', 'Email Address *')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="name@example.com"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.gender', 'Gender')}</Text>
              <View style={[styles.chipRow, isRTL && { flexDirection: 'row-reverse' }]}>
                {GENDERS.map((g) => (
                  <TouchableOpacity
                    key={g.value}
                    style={[styles.chip, form.gender === g.value && styles.chipActive]}
                    onPress={() => setForm((f) => ({ ...f, gender: g.value }))}
                  >
                    <Text style={[styles.chipText, form.gender === g.value && styles.chipTextActive]}>
                      {t(g.labelKey, g.fallback)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <DatePicker
              label={t('register.dobRequired', 'Date of Birth *')}
              value={form.dateOfBirth}
              onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
              placeholder={t('register.selectBirthDate', 'Select birth date')}
              maxDate={new Date().toISOString().split('T')[0]}
            />

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.addressRequired', 'Address *')}</Text>
              <TextInput
                style={[styles.input, styles.multiline, isRTL && { textAlign: 'right' }]}
                value={form.address}
                onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                placeholder={t('register.residentialAddress', 'Residential Address')}
                placeholderTextColor={Colors.textLight}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Unit Selection */}
            <Text style={[styles.sectionHeader, { marginTop: Spacing.lg }, isRTL && { textAlign: 'right' }]}>{t('register.unitAssignment', 'Unit Assignment')}</Text>

            {/* Province picker */}
            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.provinceRequired', '1. Province *')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, isRTL && { flexDirection: 'row-reverse' }]}>
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
                <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.districtRequired', '2. District *')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, isRTL && { flexDirection: 'row-reverse' }]}>
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
                <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.areaRequired', '3. Area *')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, isRTL && { flexDirection: 'row-reverse' }]}>
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
                <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.basicUnitRequired', '4. Basic Unit *')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, isRTL && { flexDirection: 'row-reverse' }]}>
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
            <Text style={[styles.sectionHeader, { marginTop: Spacing.lg }, isRTL && { textAlign: 'right' }]}>{t('register.accountPassword', 'Account Password')}</Text>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.passwordOptional', 'Password (Optional)')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
                value={form.password}
                onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                placeholder="••••••••"
                placeholderTextColor={Colors.textLight}
                secureTextEntry
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('register.confirmPassword', 'Confirm Password')}</Text>
              <TextInput
                style={[styles.input, isRTL && { textAlign: 'right' }]}
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
                <Text style={styles.btnText}>{t('register.submitRegistration', 'Submit Registration')}</Text>
              )}
            </TouchableOpacity>

            <Link href="/login" asChild>
              <TouchableOpacity style={styles.backBtn}>
                <Text style={styles.backBtnText}>
                  {t('register.alreadyHaveAccount', 'Already have an account?')} <Text style={{ fontWeight: '700', color: Colors.primary }}>{t('auth.signIn', 'Sign In')}</Text>
                </Text>
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
