import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PageId } from '../types/terra';

export interface LanguageOption {
  code: string;
  name: string;
  nativeLabel: string;
  speechLocale: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeLabel: 'English', speechLocale: 'en-IN' },
  { code: 'kn', name: 'Kannada', nativeLabel: 'ಕನ್ನಡ (Kannada)', speechLocale: 'kn-IN' },
  { code: 'hi', name: 'Hindi', nativeLabel: 'हिन्दी (Hindi)', speechLocale: 'hi-IN' },
  { code: 'ta', name: 'Tamil', nativeLabel: 'தமிழ் (Tamil)', speechLocale: 'ta-IN' },
  { code: 'te', name: 'Telugu', nativeLabel: 'తెలుగు (Telugu)', speechLocale: 'te-IN' },
  { code: 'mr', name: 'Marathi', nativeLabel: 'मराठी (Marathi)', speechLocale: 'mr-IN' },
  { code: 'ml', name: 'Malayalam', nativeLabel: 'മലയാളം (Malayalam)', speechLocale: 'ml-IN' },
  { code: 'bn', name: 'Bengali', nativeLabel: 'বাংলা (Bengali)', speechLocale: 'bn-IN' },
  { code: 'gu', name: 'Gujarati', nativeLabel: 'ગુજરાતી (Gujarati)', speechLocale: 'gu-IN' },
  { code: 'pa', name: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ (Punjabi)', speechLocale: 'pa-IN' },
  { code: 'or', name: 'Odia', nativeLabel: 'ଓଡ଼ିଆ (Odia)', speechLocale: 'or-IN' },
  { code: 'ur', name: 'Urdu', nativeLabel: 'اردو (Urdu)', speechLocale: 'ur-IN' },
  { code: 'es', name: 'Spanish', nativeLabel: 'Español (Spanish)', speechLocale: 'es-ES' },
  { code: 'fr', name: 'French', nativeLabel: 'Français (French)', speechLocale: 'fr-FR' },
  { code: 'ar', name: 'Arabic', nativeLabel: 'العربية (Arabic)', speechLocale: 'ar-SA' },
];

const NAV_TRANSLATIONS: Record<string, Partial<Record<PageId, string>>> = {
  kn: {
    home: 'ಮುಖಪುಟ (Home)',
    'live-earth': 'ಲೈವ್ ಭೂಮಿ ಮಾನಿಟರ್',
    workspace: 'ಸಂಶೋಧನಾ ಕಾರ್ಯಕ್ಷೇತ್ರ',
    'data-scout': 'ಡೇಟಾ ಸ್ಕೌಟ್',
    'trend-detective': 'ಪ್ರವೃತ್ತಿ ಪತ್ತೇದಾರ',
    'geo-intelligence': 'ಭೌಗೋಳಿಕ ಬುದ್ಧಿಮತ್ತೆ',
    'relationship-analyst': 'ಸಂಬಂಧ ವಿಶ್ಲೇಷಕ',
    'cause-investigator': 'ಕಾರಣ ತನಿಖಾಧಿಕಾರಿ',
    'science-challenger': 'ವಿಜ್ಞಾನ ಸವಾಲುಗಾರ',
    'impact-analyst': 'ಪರಿಣಾಮ ವಿಶ್ಲೇಷಕ',
    'earth-judge': 'ಭೂ ನ್ಯಾಯಾಧೀಶ',
    'solution-centre': 'ಪರಿಹಾರ ಕೇಂದ್ರ',
    'scientific-reports': 'ವೈಜ್ಞಾನಿಕ ವರದಿಗಳು',
  },
  hi: {
    home: 'होम (Home)',
    'live-earth': 'लाइव अर्थ मॉनिटर',
    workspace: 'अनुसंधान कार्यक्षेत्र',
    'data-scout': 'डेटा स्काउट',
    'trend-detective': 'ट्रेंड डिटेक्टिव',
    'geo-intelligence': 'भू-इंटेलिजेंस',
    'relationship-analyst': 'संबंध विश्लेषक',
    'cause-investigator': 'कारण अन्वेषक',
    'science-challenger': 'विज्ञान चैलेंजर',
    'impact-analyst': 'प्रभाव विश्लेषक',
    'earth-judge': 'अर्थ जज',
    'solution-centre': 'समाधान केंद्र',
    'scientific-reports': 'वैज्ञानिक रिपोर्ट',
  },
};

const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  kn: {
    newInvestigation: 'ಹೊಸ ತನಿಖೆ',
    investigationContext: 'ತನಿಖಾ ಸಂದರ್ಭ:',
    voiceAssistant: 'ಧ್ವನಿ ಸಹಾಯಕ',
    language: 'ಭಾಷೆ',
  },
  hi: {
    newInvestigation: 'नई जांच',
    investigationContext: 'जांच संदर्भ:',
    voiceAssistant: 'वॉइस असिस्टेंट',
    language: 'भाषा',
  },
};

interface LanguageContextValue {
  language: LanguageOption;
  setLanguageCode: (code: string) => void;
  navLabel: (id: PageId, fallback: string) => string;
  uiText: (key: string, fallback: string) => string;
  voiceOpen: boolean;
  setVoiceOpen: (open: boolean) => void;
  translating: boolean;
  setTranslating: (val: boolean) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [langCode, setLangCode] = useState<string>(() => {
    try {
      return localStorage.getItem('terra_sleuth_lang') || 'en';
    } catch {
      return 'en';
    }
  });
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [translating, setTranslating] = useState(false);

  const language = useMemo(
    () => SUPPORTED_LANGUAGES.find((l) => l.code === langCode) ?? SUPPORTED_LANGUAGES[0],
    [langCode]
  );

  useEffect(() => {
    try {
      localStorage.setItem('terra_sleuth_lang', language.code);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = language.code;
      }
    } catch {
      // Ignore storage error
    }
  }, [language.code]);

  const setLanguageCode = (code: string) => {
    if (SUPPORTED_LANGUAGES.some((l) => l.code === code)) {
      setLangCode(code);
    }
  };

  const navLabel = (id: PageId, fallback: string) => {
    if (language.code === 'en') return fallback;
    return NAV_TRANSLATIONS[language.code]?.[id] ?? fallback;
  };

  const uiText = (key: string, fallback: string) => {
    if (language.code === 'en') return fallback;
    return UI_TRANSLATIONS[language.code]?.[key] ?? fallback;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguageCode,
        navLabel,
        uiText,
        voiceOpen,
        setVoiceOpen,
        translating,
        setTranslating,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
