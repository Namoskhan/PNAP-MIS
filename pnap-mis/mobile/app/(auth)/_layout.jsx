import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '../../src/constants/colors';

export default function AuthLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Already logged in — bounce to home.
  if (user) return <Redirect href="/" />;

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen
        name="register"
        options={{ title: 'Member Registration', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{ title: 'Reset Password', headerStyle: { backgroundColor: Colors.primary }, headerTintColor: '#fff' }}
      />
    </Stack>
  );
}
