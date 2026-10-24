import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';

/**
 * Community is English-only. Other translation files may exist in the
 * repository, but they are not registered and cannot be selected.
 */
export const supportedLanguages = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
];

export const euLanguages = supportedLanguages.filter(lang =>
    ['en'].includes(lang.code)
);

const resources = {
    en: { translation: enTranslation },
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        supportedLngs: ['en'],
        nonExplicitSupportedLngs: true,
        load: 'languageOnly',
        debug: false,
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage'],
            // Key kept so a saved language preference still applies after this rename.
            lookupLocalStorage: 'complianceos-language',
        },
    });

export default i18n;

export const changeLanguage = async (lang: string) => {
    const code = typeof lang === 'string' ? lang.toLowerCase().split('-')[0] : '';
    if (code !== 'en') return;
    await i18n.changeLanguage('en');
    localStorage.setItem('complianceos-language', 'en');
};

export const getCurrentLanguage = () => i18n.language;

export const getLanguageName = (code: string) => {
    const lang = supportedLanguages.find(l => l.code === code);
    return lang?.nativeName || 'English';
};
