import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';
import { UnitProvider } from '../src/context/UnitContext';
import { ToastProvider } from '../src/components/Toast';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { api } from '../src/api/client';
import { Colors } from '../src/constants/colors';

// Fetch and mutate Colors dynamically at startup
function useGlobalBranding() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api.get('/public/branding')
      .then(res => {
        const theme = res.data?.data?.theme;
        if (theme) {
          const mode = theme.activeMode === 'DARK' ? 'dark' : 'light';
          const palette = theme[mode] || theme.light || {};
          // Mutate the static Colors object in-memory
          Object.assign(Colors, palette);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  return ready;
}

export default function RootLayout() {
  const brandingReady = useGlobalBranding();
  if (!brandingReady) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <UnitProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
            </Stack>
          </ToastProvider>
        </UnitProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
