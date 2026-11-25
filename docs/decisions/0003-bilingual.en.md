# 0003 Chinese and English: Lingui for the UI, two copies of the docs

Date: 2026-11-25 · Status: accepted · [中文](./0003-bilingual.md)

## Context

LYC wants the app in both Chinese and English, and the GitHub project readable in English for future readers.

## Decision

- **UI**: Lingui (`@lingui/core` + `@lingui/react`; the Vite plugin transforms macros natively, no Babel needed). The source language is Chinese, written in the code; English lives in `src/locales/en/messages.po`.
  - Lingui over i18next: compile-time macros and a small runtime; text stays in the components with no separate keys; `lingui extract` finds new and untranslated text automatically.
  - The first visit follows the browser language. A switch is saved on the device and on the account (`convex/prefs.ts`, the `app` row of `viewPrefs`); after sign-in the account setting wins.
  - Only the UI is translated, never user content (node titles, space names, etc.). The backend returns error codes only; the frontend shows the text in the current language.
  - CI: `npm run i18n:check` verifies the catalogs are up to date with the code; `tests/i18n.test.ts` verifies no English translation is missing and placeholders match.
- **Repository docs**: README, DESIGN and decision records each have Chinese and English versions (the English README is the default landing page; English decision records are `*.en.md`). Changing one updates the other in the same PR.
  - CLAUDE.md stays as one Chinese copy (it is the working rulebook for Claude, and two copies drift easily), with an English summary at the top.
  - Code comments stay in Chinese for now.

## Consequences

- Every new UI string needs an English translation, or CI fails.
- English is usually longer, so layouts must work in both languages (see DESIGN.md).
