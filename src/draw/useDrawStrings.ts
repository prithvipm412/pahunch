/**
 * src/draw/useDrawStrings.ts — typed i18n accessor for Draw screen strings.
 * Reads the current language from the app-wide LanguageContext.
 */
import { useLanguage } from '../app/lang'
import learnRaw from '../../content/i18n/draw.json'

type DrawStrings = typeof learnRaw.en
type DrawJson = { en: DrawStrings; kn: DrawStrings }

const strings = learnRaw as DrawJson

export function useDrawStrings(): DrawStrings {
  const { lang } = useLanguage()
  return strings[lang] ?? strings.en
}
