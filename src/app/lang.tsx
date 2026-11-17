import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { t as translate, type TranslationKey } from './i18n'

export type Language = 'en' | 'kn'
interface LanguageContextValue { lang: Language; setLang: (lang: Language) => void }
const LanguageContext = createContext<LanguageContextValue>({ lang: 'en', setLang: () => undefined })

/** Provides the saved interface language to the app. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try { return localStorage.getItem('pahunch-language') === 'kn' ? 'kn' : 'en' } catch { return 'en' }
  })
  const setLang = (next: Language) => {
    setLangState(next)
    try { localStorage.setItem('pahunch-language', next) } catch { /* Storage may be disabled. */ }
  }
  const value = useMemo(() => ({ lang, setLang }), [lang])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/** Reads the current interface language. */
export function useLanguage() { return useContext(LanguageContext) }

/** Returns a language-aware translator for the current screen. */
export function useT() {
  const { lang } = useLanguage()
  return (key: TranslationKey) => translate(key, lang)
}
