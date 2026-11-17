/**
 * content/puzzles/types.ts — shared shapes for Predict and Fault Hunt content.
 *
 * Every netlist in predict.ts / faults.ts is checked against the real solve() in
 * content/puzzles/puzzles.test.ts, so the authored `correctKey` / `faultyId` can
 * never silently drift from what the physics engine actually computes.
 */
import type { Netlist } from '../../src/contracts/netlist'

export interface LocalizedText {
  en: string
  kn: string
}

export type SkillKey =
  | 'complete_loop'
  | 'sharing'
  | 'separate_paths'
  | 'one_path'
  | 'resistance'
  | 'voltage'
  | 'shortcut_path'
  | 'trace_loop'
  | 'spot_shortcut'
  | 'direction_matters'
  | 'safe_voltage'

export interface PredictOptionDef {
  key: string
  text: LocalizedText
}

export interface PredictQuestion {
  id: string
  netlist: Netlist
  question: LocalizedText
  options: PredictOptionDef[]
  correctKey: string
  why: LocalizedText
  skill: SkillKey
}

export interface FaultQuestion {
  id: string
  prompt: LocalizedText
  hint: LocalizedText
  why: LocalizedText
  skill: SkillKey
  brokenNetlist: Netlist
  faultyId: string
  fixedNetlist: Netlist
}
