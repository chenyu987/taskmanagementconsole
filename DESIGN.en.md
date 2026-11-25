# DESIGN.md (English)

**English** · [中文](./DESIGN.md) (keep both in sync)

**Every frontend change must follow this file.** Each PR with a frontend change includes light and dark screenshots.

Status: fonts are final (C headings + A body). Other values are refined as phase 1 pages are built; changes update both this file and `src/index.css`.

## Aesthetic: restrained, few words, sharp

References: Notion's content-first layout, Robinhood's data presentation and interaction feedback, Apple's typography and motion. Simple, direct, useful.

## Rules

### Layout

- Content first: keep decoration to a minimum. Use few borders, cards and shadows; organize information with whitespace and alignment.
- One focus per screen. Secondary actions stay hidden until hover or a keyboard shortcut.
- Align to one grid and one spacing scale; no ad-hoc spacing.

### Hierarchy

- Hierarchy comes from typography: size, weight and gray level, not color or boxes.
- Only weights 400 / 500 / 600.
- Numbers are always tabular (`tabular-nums`) so they compare vertically.

### Fonts

- **Final (2026-11-25, LYC chose "C headings + A body")**: body text is calm and crisp (A, "precise"); headings feel bookish with stronger hierarchy (C, "editorial").
  - Latin body: Geist (`@fontsource-variable/geist`, variable weight)
  - Numbers / code: Geist Mono (`@fontsource-variable/geist-mono`), numbers always `tabular-nums`
  - Chinese body: the system sans, not bundled: PingFang (Mac / iOS), HarmonyOS Sans SC (Huawei), Microsoft YaHei (Windows), Noto Sans SC (others).
    HarmonyOS Sans is not bundled because its license forbids any modification (including subsetting or converting to woff2), and the full font is about 8MB per weight, too large for web and mobile.
  - Headings `--font-display`: Fraunces for Latin (`@fontsource-variable/fraunces`), Noto Serif SC for Chinese (`@fontsource-variable/noto-serif-sc`, OFL, split by unicode-range so only used glyphs download).
    Used for page titles and high-level nodes (visions, areas, project names). Task rows, buttons and forms use the body font.
  - All font files are imported in `src/fonts.css`.
- Considered and not adopted: B "warm" (Instrument Sans + MiSans).
- Preview page: run `npm run dev` and open `/?preview=today` (dev only). Screenshots are in `screenshots/phase1-today/`.

### Color

- One neutral gray scale plus one accent color.
- Status colors (success / warning / error) only where they carry meaning.
- Dark mode is supported, with one token set for light and one for dark.

### Design tokens

- Spacing, radius, shadow, color and font size are all design tokens, and **the whole app uses only these tokens**.
- Tokens live in the `@theme` block of `src/index.css` (Tailwind v4). React Flow and visx charts read from the same place.
- Spacing is based on 4px; 2–3 radius steps; one shadow level, only for overlays (menus, dialogs).

### Motion

- Short (150–250ms), physical (spring or ease-out), purposeful.
- Only to confirm an action or show spatial relationships (expand, move, complete). No decorative animation.
- Respect the system "reduce motion" setting.

### Chinese and English

- All UI text goes through Lingui (`<Trans>` or `` t`…` ``), never hard-coded in JSX; new text gets an English translation (see README).
- Layouts must work in both languages: English is usually longer, so don't size buttons, labels or columns to the Chinese character count. Allow wrapping or truncation.
- The language switch sits in the top-right corner and shows the name of the *other* language (English / 中文).
- Screenshots default to Chinese; for text-heavy screens, add an English screenshot too.

### Required details

- Empty, loading and error states.
- Keyboard shortcuts (with a shortcut overview).
- Hover and press feedback.

### shadcn/ui

- Only as low-level building blocks, re-themed with these tokens.
- No recognizable shadcn defaults (default borders, radius, grays and shadows must all be replaced).

## Process

1. First build only the design system and one sample page (the Today view), get LYC's approval from screenshots, then roll out to other pages.
2. After that, every frontend change includes screenshots (light + dark, captured automatically with Playwright).
