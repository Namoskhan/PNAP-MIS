import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ur from './locales/ur.json';
import ps from './locales/ps.json';
import { api } from '../api/client';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'ps', label: 'پښتو', dir: 'rtl' },
];

export const LANG_STORAGE_KEY = 'pnap_lang';

export function getSavedLanguage() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && ['en', 'ur', 'ps'].includes(saved)) {
      return saved;
    }
    // Check cached user profile preferredLanguage if available
    const cachedUser = localStorage.getItem('pnap_user');
    if (cachedUser) {
      const parsed = JSON.parse(cachedUser);
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
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.documentElement.setAttribute('data-lang', lang);
    if (document.body) {
      document.body.dir = dir;
    }
  }
}

export async function changeAppLanguage(lang, syncServer = true) {
  if (!['en', 'ur', 'ps'].includes(lang)) return;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {}

  applyLanguageDirection(lang);
  await i18n.changeLanguage(lang);

  // If user is authenticated, fire background request to persist preference on user profile
  if (syncServer && typeof localStorage !== 'undefined' && localStorage.getItem('pnap_token')) {
    api.patch('/auth/language', { language: lang }).catch(() => {
      // Offline or network error - silently ignore to prevent disrupting user experience
    });
  }
}

const initialLang = getSavedLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ur: { translation: ur },
      ps: { translation: ps },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

applyLanguageDirection(initialLang);

export default i18n;
