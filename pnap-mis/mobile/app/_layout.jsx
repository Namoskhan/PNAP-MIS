import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';
import { UnitProvider } from '../src/context/UnitContext';
import { ToastProvider } from '../src/components/Toast';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform, LogBox } from 'react-native';
import { useEffect, useState } from 'react';
import { api } from '../src/api/client';
import { Colors } from '../src/constants/colors';

// Suppress non-actionable dev/library warnings (React Navigation web pointerEvents, reanimated reduced motion, etc.)
LogBox.ignoreLogs([
  'props.pointerEvents is deprecated',
  '"shadow*" style props are deprecated',
  '[Reanimated] Reduced motion',
]);

if (Platform.OS === 'web' && typeof console !== 'undefined') {
  const origWarn = console.warn;
  console.warn = (...args) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('props.pointerEvents is deprecated') ||
      msg.includes('"shadow*" style props are deprecated') ||
      msg.includes('[Reanimated] Reduced motion')
    ) {
      return;
    }
    origWarn.apply(console, args);
  };
}

// Global protection against third-party Chrome extension / web-vitals injected errors
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const isIgnoredError = (msg = '', filename = '', stack = '') => {
    const text = `${msg} ${filename} ${stack}`.toLowerCase();
    return (
      text.includes('chrome-extension://') ||
      text.includes('m_id') ||
      text.includes('reportallchanges') ||
      text.includes('starttime') ||
      text.includes('web-vitals')
    );
  };

  window.addEventListener(
    'error',
    (event) => {
      const msg = event?.message || '';
      const filename = event?.filename || '';
      const stack = event?.error?.stack || '';
      if (isIgnoredError(msg, filename, stack)) {
        event.stopImmediatePropagation?.();
        event.preventDefault?.();
        return true;
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = event?.reason?.message || String(event?.reason || '');
      const stack = event?.reason?.stack || '';
      if (isIgnoredError(reason, '', stack)) {
        event.stopImmediatePropagation?.();
        event.preventDefault?.();
        return true;
      }
    },
    true
  );
}

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

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const styleId = 'pnap-mobile-web-reset';
      if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          html, body, #root {
            height: 100% !important;
            height: 100dvh !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
            box-sizing: border-box !important;
          }
          * {
            box-sizing: border-box !important;
          }
          [role="tablist"] [role="tab"] {
            padding-top: 2px !important;
            padding-bottom: 2px !important;
            justify-content: center !important;
          }
          [role="tablist"] [role="tab"] > div:last-child {
            line-height: 14px !important;
            overflow: visible !important;
          }
        `;
        document.head?.appendChild(style);
      }

      return () => {
        if (typeof window.removeEventListener === 'function') {
          window.removeEventListener('error', handleExtensionError, true);
        }
      };
    }
  }, []);

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
