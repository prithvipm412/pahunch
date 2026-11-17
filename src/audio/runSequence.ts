/**
 * src/audio/runSequence.ts — the one fixed order every "Run" action follows, in both Build and
 * Sparsh, replacing whatever played before (including the "legend"-style explanation that used
 * to open the Sparsh run — see docs/status/l1.md for how that was traced and removed):
 *
 *   1. speak "Okay, running circuit." (speak_starting)
 *   2. once that ends: the status haptic + status sound together (status_feedback)
 *   3. once THAT clears, the existing per-outcome result clip/text (speak_result)
 *   4. start the continuous sonify() tone (sonify)
 *
 * This file only describes the ORDER, as a pure function, so it's testable without React, Web
 * Audio, or speechSynthesis, and both src/sparsh/machine.ts (via its effects array) and
 * src/build/index.tsx's runCircuit() can be checked against the same contract. Each caller
 * supplies its own concrete content for "speak_result" (Sparsh: its ClipName[] vocabulary;
 * Build: plain translated text) and fills in `sonify()`'s actual SolveResult — this module
 * doesn't know about either.
 */
import type { CircuitStatus } from './feedbackSounds'

/** Spoken at the very start of every run, replacing any previous "running..." announcement. */
export const RUN_STARTING_TEXT = {
  en: 'Okay, running circuit.',
  kn: 'ಸರಿ, ಸರ್ಕ್ಯೂಟ್ ಚಾಲನೆ ಮಾಡುತ್ತಿದ್ದೇನೆ.',
} as const

export type RunSequenceStep =
  | { kind: 'speak_starting' }
  | { kind: 'status_feedback'; status: CircuitStatus }
  | { kind: 'speak_result' }
  | { kind: 'sonify' }

/** The fixed 4-step order for a run, given its classified status. Always ends in `sonify` —
 * even for a not-working/broken circuit, since sonify()'s own gain floor is already
 * near-silent when no current is actually flowing, and a single shared rule is simpler than a
 * special case per status. */
export function runSequence(status: CircuitStatus): RunSequenceStep[] {
  return [
    { kind: 'speak_starting' },
    { kind: 'status_feedback', status },
    { kind: 'speak_result' },
    { kind: 'sonify' },
  ]
}
