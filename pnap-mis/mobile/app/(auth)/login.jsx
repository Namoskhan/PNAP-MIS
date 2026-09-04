import { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { errorMessage } from '../../src/api/client';
import { useToast } from '../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      setErr('Please enter your identifier and password.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await login(identifier.trim(), password);
      toast.success('Welcome back!');
      router.replace('/');
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header Banner */}
      <View style={styles.header}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>P</Text>
        </View>
        <Text style={styles.appName}>PNAP MIS</Text>
        <Text style={styles.appTagline}>Management Information System</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSubtitle}>Enter your CNIC, member ID, or phone number</Text>

            {err ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{err}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Identifier</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="CNIC / Member ID / Phone"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textLight}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  style={styles.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={handleLogin} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <Link href="/forgot-password" asChild>
              <TouchableOpacity style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </Link>

            <View style={{ height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.md }} />

            <Link href="/register" asChild>
              <TouchableOpacity style={styles.registerBtn}>
                <Text style={styles.registerBtnText}>New Member? <Text style={{ fontWeight: '700', color: Colors.primary }}>Register here</Text></Text>
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
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 32,
    backgroundColor: Colors.primary,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  appName: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  appTagline: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  formContainer: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 10,
      },
    }),
  },
  cardTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.xl,
    lineHeight: 18,
  },
  errorBanner: {
    backgroundColor: Colors.errorBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.sm,
  },
  field: { marginBottom: Spacing.lg },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.base,
    color: Colors.text,
    backgroundColor: Colors.surfaceAlt,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  eyeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 8px rgba(30, 64, 175, 0.35)',
      },
      default: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  btnDisabled: { opacity: 0.65 },
  btnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  forgotBtn: { marginTop: Spacing.lg, alignItems: 'center' },
  forgotText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '500' },
  registerBtn: { alignItems: 'center', paddingVertical: Spacing.xs },
  registerBtnText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
