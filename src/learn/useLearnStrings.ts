/**
 * src/learn/useLearnStrings.ts — typed i18n accessor for Learn screen strings.
 */
import { useLanguage } from '../app/lang'
import learnRaw from '../../content/i18n/learn.json'

type LearnStrings = typeof learnRaw.en
type LearnJson = { en: LearnStrings; kn: LearnStrings }

const strings = learnRaw as LearnJson

export function useLearnStrings(): LearnStrings {
  const { lang } = useLanguage()
  return strings[lang] ?? strings.en
}
