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
import { api, errorMessage } from '../../src/api/client';
import { useToast } from '../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';
import { useRouter } from 'expo-router';

export default function ForgotPasswordScreen() {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function handleSubmit() {
    if (!identifier.trim()) return;
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { identifier: identifier.trim() });
      setSent(true);
      toast.success('Reset instructions sent to your email.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {sent ? (
              <>
                <Text style={styles.icon}>📧</Text>
                <Text style={styles.title}>Check your email</Text>
                <Text style={styles.subtitle}>
                  If an account matches that identifier, we've sent password reset instructions to the registered email.
                </Text>
                <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
                  <Text style={styles.btnText}>Back to Sign In</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>Enter your CNIC, member ID, or phone number.</Text>
                <View style={styles.field}>
                  <Text style={styles.label}>Identifier</Text>
                  <TextInput
                    style={styles.input}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="CNIC / Member ID / Phone"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="none"
                    returnKeyType="send"
                    onSubmitEditing={handleSubmit}
                  />
                </View>
                <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={handleSubmit} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send Reset Link</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xxl,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
      },
    }),
  },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: Spacing.lg },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.xl, lineHeight: 20 },
  field: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.base, color: Colors.text, backgroundColor: Colors.surfaceAlt,
  },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  btnText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
});
