import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { errorMessage } from '../../src/api/client';
import { Storage } from '../../src/utils/storage';
import { useToast } from '../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Pre-load saved remember choice and identifier if remembered
  useEffect(() => {
    (async () => {
      try {
        const [savedKeep, savedId] = await Promise.all([
          Storage.getItem('pnap_remember_me'),
          Storage.getItem('pnap_saved_identifier'),
        ]);
        if (savedKeep !== null) {
          setKeepLoggedIn(savedKeep === 'true');
        }
        if (savedId) {
          setIdentifier(savedId);
        }
      } catch {}
    })();
  }, []);

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      setErr('Please enter your identifier and password.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      await login(identifier.trim(), password, keepLoggedIn);
      if (keepLoggedIn) {
        await Storage.setItem('pnap_saved_identifier', identifier.trim());
      } else {
        await Storage.removeItem('pnap_saved_identifier');
      }
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
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
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

            {/* Keep me logged in switch */}
            <TouchableOpacity
              style={styles.keepRow}
              activeOpacity={0.7}
              onPress={() => setKeepLoggedIn((k) => !k)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: keepLoggedIn }}
            >
              <View style={styles.keepInfo}>
                <View style={styles.keepHeaderRow}>
                  <Ionicons
                    name={keepLoggedIn ? 'shield-checkmark' : 'shield-outline'}
                    size={16}
                    color={keepLoggedIn ? Colors.primary : Colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.keepTitle}>Keep me logged in</Text>
                </View>
                <Text style={styles.keepSub}>Stay signed in for 7 days (offline ready)</Text>
              </View>
              <Switch
                value={keepLoggedIn}
                onValueChange={setKeepLoggedIn}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Platform.OS === 'android' ? (keepLoggedIn ? Colors.primaryDark : '#f4f3f4') : '#fff'}
              />
            </TouchableOpacity>

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
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
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
  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  keepInfo: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  keepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  keepTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  keepSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
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
