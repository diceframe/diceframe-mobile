# UI Components

This directory is the local React Native Reusables registry output.

- Add or refresh primitives with `npm run ui:add -- <component>`.
- Validate project configuration with `npm run ui:doctor`.
- Keep upstream component APIs intact; application code should use the documented compound APIs.
- Put DiceFrame composition and data-loading behavior in `src/components/patterns` or a feature directory.
- Keep product colors in `src/global.css` and `src/lib/theme.ts`.
- Never add DiceFrame variants to registry files. Compose them in `src/components/patterns`; semantic badge tones live in `status-badge.tsx`.
