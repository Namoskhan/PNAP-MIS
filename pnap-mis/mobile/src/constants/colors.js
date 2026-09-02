// Color palette for PNAP-MIS mobile app.
// Mirrors the web app's CSS variables (--primary, --surface, etc.)
// so both interfaces stay visually consistent.

export const Colors = {
  // Primary brand
  primary: '#1e40af',       // Blue 800
  primaryDark: '#1e3a8a',   // Blue 900
  primaryLight: '#3b82f6',  // Blue 500
  accent: '#60a5fa',        // Blue 400

  // Surfaces
  background: '#f0f4f8',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  card: '#ffffff',
  sidebar: '#1e3a8a',

  // Text
  text: '#1e293b',
  textMuted: '#64748b',
  textLight: '#94a3b8',
  textInverse: '#ffffff',

  // Borders
  border: '#e2e8f0',
  borderLight: '#f1f5f9',

  // Status
  success: '#16a34a',
  successBg: '#f0fdf4',
  warning: '#d97706',
  warningBg: '#fffbeb',
  error: '#dc2626',
  errorBg: '#fef2f2',
  info: '#0891b2',
  infoBg: '#ecfeff',

  // Finance
  income: '#16a34a',
  expense: '#dc2626',

  // Status pills
  active: '#16a34a',
  pending: '#d97706',
  inactive: '#6b7280',
  rejected: '#dc2626',
  suspended: '#7c3aed',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const FontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  xxxl: 28,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

import { Platform } from 'react-native';

export const Shadow = Platform.select({
  web: {
    sm: { boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)' },
    md: { boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)' },
    lg: { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)' },
  },
  default: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 5,
    },
  },
});
