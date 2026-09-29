import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, changeAppLanguage } from '../i18n';
import { GlobeIcon } from './icons';

export default function LanguageSelector({ variant = 'default', className = '', style = {} }) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'en';

  return (
    <div
      className={`lang-selector lang-selector-${variant} ${className}`}
      role="group"
      aria-label="Language selection"
      style={style}
    >
      <span className="lang-icon" aria-hidden="true">
        <GlobeIcon size={14} />
      </span>
      <div className="lang-items">
        {SUPPORTED_LANGUAGES.map((lang, idx) => {
          const isActive = currentLang === lang.code;
          return (
            <span key={lang.code} className="lang-item-wrap">
              {idx > 0 && <span className="lang-separator" aria-hidden="true">·</span>}
              <button
                type="button"
                className={`lang-btn ${isActive ? 'active' : ''}`}
                onClick={() => changeAppLanguage(lang.code)}
                aria-pressed={isActive}
                aria-label={`Switch to ${lang.label}`}
                title={lang.label}
              >
                {lang.label}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
