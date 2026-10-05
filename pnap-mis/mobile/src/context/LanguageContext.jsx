import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import i18n, { SUPPORTED_LANGUAGES, getSavedLanguage, changeAppLanguage } from '../i18n';

const LanguageContext = createContext({
  currentLanguage: 'en',
  isRTL: false,
  changeLanguage: async () => {},
  supportedLanguages: SUPPORTED_LANGUAGES,
  t: (key, fallback) => fallback || key,
  i18n,
});

export function LanguageProvider({ children }) {
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language || 'en');

  useEffect(() => {
    let mounted = true;
    getSavedLanguage().then((lang) => {
      if (mounted && lang && lang !== currentLanguage) {
        setCurrentLanguage(lang);
      }
    });

    const handleLanguageChanged = (lng) => {
      if (mounted) {
        setCurrentLanguage(lng);
      }
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      mounted = false;
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  const isRTL = useMemo(() => {
    return currentLanguage === 'ur' || currentLanguage === 'ps';
  }, [currentLanguage]);

  const handleChangeLanguage = useCallback(async (lang, syncServer = true) => {
    const updated = await changeAppLanguage(lang, syncServer);
    if (updated) {
      setCurrentLanguage(updated);
    }
    return updated;
  }, []);

  const t = useCallback((key, fallbackOrParams, maybeParams) => {
    return i18n.t(key, fallbackOrParams, maybeParams);
  }, [currentLanguage]);

  const value = useMemo(() => ({
    currentLanguage,
    isRTL,
    changeLanguage: handleChangeLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
    t,
    i18n,
  }), [currentLanguage, isRTL, handleChangeLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      t: (key, fallback) => i18n.t(key, fallback),
      i18n,
    };
  }
  return {
    t: ctx.t,
    i18n: ctx.i18n,
  };
}

export default LanguageContext;
