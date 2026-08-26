import { Alert, Platform } from 'react-native';

export function confirmAction(title, message, onConfirm, { confirmText = 'Confirm', cancelText = 'Cancel', destructive = false } = {}) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`${title}\n\n${message}`);
      if (ok) onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel' },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);
  }
}
