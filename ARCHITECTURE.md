# Architecture

## Data flow

```
Build mode  ──┐
Draw mode   ──┼──> Netlist ──> validator ──> solve() ──> SolveResult ──┬──> animation (on-screen)
Sparsh mode ──┘                               (MNA)                     ├──> sonification (audio)
                                                                         ├──> haptics (touch)
                                                                         └──> predict feedback (learn)
```

Build, Draw, and Sparsh all produce the same `Netlist` shape (`src/contracts/netlist.ts`). A
validator checks it, then `solve()` (`src/physics`) runs a deterministic Modified Nodal Analysis
(MNA) solve and returns a `SolveResult`. Every presentation layer — the on-screen circuit
animation, Sparsh's audio sonification and haptics, and Learn's predict-then-check feedback —
consumes the same `SolveResult`, so physics is computed exactly once per netlist.

## Folders

- `src/contracts` — shared TypeScript types (`Netlist`, `SolveResult`, etc.). Add-only.
- `src/physics` — the deterministic MNA solver. The only source of truth for circuit physics.
- `src/sparsh` — audio + touch mode for blind students.
- `src/app` — shell/navigation/shared app state.
- `src/build` — on-screen circuit builder mode.
- `src/audio` — shared audio playback/sonification utilities.
- `src/draw` — paper-photo-to-netlist mode (calls the Gemini-backed API).
- `src/learn` — guided lessons and predict-then-check exercises.
- `content/puzzles` — circuit puzzle definitions.
- `content/i18n` — localized text content.
- `public/audio` — static audio assets.
- `api` — server-side functions (Vercel). Holds the Gemini API key.
- `docs/status` — per-owner status logs (`l1.md`, `l2.md`, `l3.md`).

## Key decisions

- **The LLM never computes physics.** Draw mode uses Gemini only to transcribe a photographed
  circuit into a `Netlist`. All electrical behavior comes from the deterministic `solve()` in
  `src/physics`.
- **Offline-first.** The app is a PWA designed to run on a low-end Android phone in Chrome without
  a network connection.
- **Only Draw mode needs network.** Build and Sparsh work entirely offline; Draw mode needs
  connectivity to reach the Gemini API.
- **The Gemini API key lives server-side only**, read from `process.env.GEMINI_API_KEY` inside
  `api/`, and is never present in client code.
