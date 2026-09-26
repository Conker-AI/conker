# Character Studio improvement plan

Scope: Character Studio only. Preserve the neutral theme and existing field contracts.

## Findings

- New characters are created by renaming, which also leaves stale library entries.
- No explicit New or Duplicate action; switching is disabled without a useful recovery.
- Background, custom details, authored examples and reference settings all compete with basics.
- The preview repeats irrelevant controls on every section and appears after a long form on phones.
- Changing sections retains the previous scroll position in the embedded shell.
- Browser-local persistence, authored examples and unconnected voice generation need precise labels.

## Ordered work

1. Give the local library stable identities, migrate existing profiles, and add explicit New/Duplicate flows. Renaming edits the same character.
2. Keep name, introduction and personality prominent. Group optional background, details and examples behind labeled disclosures.
3. Make the preview section-aware, with a compact portrait summary and relevant controls. Provide a deliberate mobile preview toggle.
4. Preserve media, import/export, voice and Focus/Character controls. Show reference inputs when reference mode is selected.
5. Fix section scroll reset and keep save/discard feedback visible. Prevent unsaved drafts being replaced by library actions.
6. Test creation, rename, duplication, switching, save/reload, preview and responsive layouts; run relevant checks and commit.

## Research

- Nielsen Norman Group, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
  Keep frequently needed controls visible and make optional controls discoverable through descriptive labels.
- IBM Carbon, Form usage: https://carbondesignsystem.com/components/form/usage/
  Group related inputs, keep useful helper text beside fields, and reduce competing content.

## Acceptance

A user can create and switch characters without learning a rename trick; edit one topic
without scanning unrelated controls; see the draft they are shaping; save without losing
another character; and find all prior advanced fields. Browser-local configuration must
not imply connected voice synthesis or server-side persona enforcement.

## Verification — 26 September 2026

- Build, design guard, focused ESLint and character checks pass. Library checks cover migration, rename, independent duplicate editing, reload and malformed-entry recovery.
- Chrome: created a synthetic character, renamed and saved it, reloaded, and confirmed one renamed library entry. Existing Conker and Nova profiles survived migration; switched back to Conker.
- Verified recording-source fields and unsaved-change protection; discarded the test voice-source change.
- Viewed desktop and 390 × 844 screenshots, including mobile preview expansion. Section navigation returns to the top, and the mobile preview starts collapsed.
- Captured console errors were from the password-manager extension, not application code.
- Served at https://localhost:18150/settings/companion. No Ubuntu deployment. Character profiles remain browser-local; voice synthesis and server persona integration are still unconnected.
