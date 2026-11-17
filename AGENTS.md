# Pahunch

Pahunch is an offline phone web app (PWA) for rural school students, including blind students.
Students build DC circuits in three ways: Build mode on screen, Draw mode from a paper photo
read by Gemini, and Sparsh mode by audio + touch for blind students. A deterministic MNA solver
computes all physics. An LLM is ONLY used in Draw mode to turn a photo into a Netlist; never for
physics.

## Folder ownership

- **L1 · Claude Code**: `src/contracts`, `src/physics`, `src/sparsh`, `content/puzzles`, `docs/status/l1.md`
- **L2 · Codex**: `src/app`, `src/build`, `src/audio`, `src/App.tsx`, `src/main.tsx`, `vite.config.ts`, `tsconfig*.json`, `package.json`, `docs/status/l2.md`
- **L3 · Antigravity**: `src/draw`, `src/learn`, `api`, `content/i18n`, `public/audio`, `docs/status/l3.md`

## Rules

- Only edit your own folders. If something outside needs changing, stop and say so.
- Contracts are add-only and only L1 edits them.
- Get physics only via `solve()` from `src/physics`.
- Never install packages without approval.
- Never format/refactor outside your folders.
- Run `npm run typecheck && npm test` before every commit.
- Must work offline on a low-end Android phone in Chrome.
- Design is navy `#0B1B3F`, clean, large touch targets, smooth light animations.
- Never put API keys in code. The Gemini key is only read in `api/` from `process.env.GEMINI_API_KEY`.
- At the end of every task, update your `docs/status` file (Done / Doing / Interface changes / Needs from others).
