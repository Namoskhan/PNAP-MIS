import { I18nManager, Platform } from 'react-native';
import { Storage } from '../utils/storage';
import { api } from '../api/client';
import en from './locales/en.json';
import ur from './locales/ur.json';
import ps from './locales/ps.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', nativeName: 'اردو', dir: 'rtl' },
  { code: 'ps', label: 'پښتو', nativeName: 'پښتو', dir: 'rtl' },
];

export const LANG_STORAGE_KEY = 'pnap_lang';

const resources = { en, ur, ps };
const listeners = new Set();
let activeLanguage = 'en';

export function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export function translate(key, fallbackOrParams, maybeParams) {
  let value = getNestedValue(resources[activeLanguage], key);
  if (value === undefined) {
    value = getNestedValue(resources['en'], key);
  }

  let fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : undefined;
  let params = (typeof fallbackOrParams === 'object' && fallbackOrParams !== null)
    ? fallbackOrParams
    : (typeof maybeParams === 'object' && maybeParams !== null ? maybeParams : null);

  if (value === undefined) {
    if (fallback !== undefined) {
      if (params) {
        let formatted = String(fallback);
        for (const [k, v] of Object.entries(params)) {
          formatted = formatted.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
        }
        return formatted;
      }
      return fallback;
    }
    return key;
  }

  if (params) {
    let formatted = String(value);
    for (const [k, v] of Object.entries(params)) {
      formatted = formatted.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
    }
    return formatted;
  }

  return value;
}

export async function getSavedLanguage() {
  try {
    const saved = await Storage.getItem(LANG_STORAGE_KEY);
    if (saved && ['en', 'ur', 'ps'].includes(saved)) {
      return saved;
    }
    // Check cached user profile preferredLanguage if available
    const cachedUser = await Storage.getItem('pnap_user');
    if (cachedUser) {
      const parsed = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser;
      if (parsed?.preferredLanguage && ['en', 'ur', 'ps'].includes(parsed.preferredLanguage)) {
        return parsed.preferredLanguage;
      }
    }
  } catch {}
  return 'en';
}

export function applyLanguageDirection(lang) {
  const isRtl = lang === 'ur' || lang === 'ps';
  const dir = isRtl ? 'rtl' : 'ltr';

  try {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(isRtl);
  } catch {}

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.documentElement.setAttribute('data-lang', lang);
    if (document.body) {
      document.body.dir = dir;
    }
  }
}

export async function changeAppLanguage(lang, syncServer = true) {
  if (!['en', 'ur', 'ps'].includes(lang)) return activeLanguage;

  try {
    await Storage.setItem(LANG_STORAGE_KEY, lang);
  } catch {}

  activeLanguage = lang;
  applyLanguageDirection(lang);

  // Notify listeners
  listeners.forEach((fn) => {
    try {
      fn(lang);
    } catch {}
  });

  // If user is authenticated, fire background request to persist preference on user profile
  if (syncServer) {
    try {
      const token = await Storage.getItem('pnap_token');
      if (token) {
        api.patch('/auth/language', { language: lang }).catch(() => {
          // Offline or network error - silently ignore to prevent disrupting user experience
        });
      }
    } catch {}
  }

  return lang;
}

export const i18n = {
  get language() {
    return activeLanguage;
  },
  get isRTL() {
    return activeLanguage === 'ur' || activeLanguage === 'ps';
  },
  t: translate,
  changeLanguage: changeAppLanguage,
  on(event, fn) {
    if (event === 'languageChanged') {
      listeners.add(fn);
    }
  },
  off(event, fn) {
    if (event === 'languageChanged') {
      listeners.delete(fn);
    }
  },
};

// Bootstrap saved language on startup
getSavedLanguage().then((lang) => {
  if (lang && lang !== activeLanguage) {
    activeLanguage = lang;
    applyLanguageDirection(lang);
    listeners.forEach((fn) => {
      try {
        fn(lang);
      } catch {}
    });
  }
});

export default i18n;
