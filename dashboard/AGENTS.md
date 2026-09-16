# Dashboard UI work

Read [DESIGN.md](DESIGN.md) before changing visible Conker UI. It is the design contract for this dashboard; Chats is the approved collection reference.

- Compose standard pages with `BaseLayout` and patterns from `@/components/design-system`. Reuse the actual components for search, tabs, list rows, empty states, and collection portraits.
- Change shared patterns or add a documented semantic variant when a repeated role needs new styling. Do not copy markup into a route or override its dimensions to create a second implementation.
- Use the existing semantic theme variables and density tokens. Keep custom themes and radius settings functional, full-width page gutters, and the shared padded, uncropped portrait documented in DESIGN.md.
- Preserve specialized conversation, form, approval, and table behavior. Shared styling is not permission to replace working controls with static mockups.
- Run `npm run design:check`, appropriate TypeScript/build checks, and lint for affected files. The guard is also part of the normal build and lint commands. Never weaken it to conceal drift.
- Inspect the affected rendered screens with desktop/mobile screenshots. For shared components, compare Chats and Inbox, a form/table consumer, and light/dark themes. Verify relevant interactions and keyboard focus.

- The owner's shared styling authority is the pinned shadcnstore template. Read [template-reference.md](../docs/template-reference.md) before changing colors or primitives. Preserve direct theme mappings, valid upstream recipes, Conker's compact composition and custom navigation.
