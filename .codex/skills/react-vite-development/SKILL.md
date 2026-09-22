---
name: react-vite-development
description: Build, refactor, debug, test, or review the Tablescape React/Vite frontend. Use for workspace routes, database UI features, shadcn components, Tauri command clients, Tailwind styling, accessibility, performance, and frontend verification. Do not use as the primary guide for Rust code under src-tauri.
---

# Tablescape React + Vite development

Work within the existing desktop-first React architecture. Before editing, inspect `package.json`, `vite.config.ts`, the TypeScript and lint configs, the relevant feature code, and `git status`. Preserve unrelated work.

## Locate the owner

Choose the narrowest existing owner:

- `src/App.tsx`: application shell, connection workspace state, and route composition.
- `src/features/database`: schema diagram, table browser, query editor, connection flow, and database-specific UI.
- `src/components/ui`: shadcn/Radix primitives. Extend these primitives instead of creating one-off controls in features.
- `src/lib/database-api.ts`: the typed frontend boundary to Tauri commands and the browser-preview fallback.
- `src/lib/types.ts`: shared frontend domain contracts.
- `src/lib/sample-data.ts`: browser-preview data only; do not mistake it for persisted state.

Search for analogous behavior before adding a new pattern. Keep feature-specific state and rendering within the database feature unless it has a stable cross-feature purpose.

## Preserve the desktop boundary

Rust owns database credentials, live pools, file access, introspection, and query execution. The React client must not connect directly to databases or persist credentials in browser storage.

- Route native operations through `src/lib/database-api.ts`.
- Keep `@tauri-apps/*` imports inside that boundary or a similarly narrow platform module.
- Treat command responses as untrusted transport data when adding high-risk fields.
- Keep the browser-preview fallback functional, but never let preview behavior silently claim a real database mutation succeeded.

When a frontend change needs a new Rust command or contract, define the request, response, error, read-only, and sensitive-data behavior before wiring presentation code. Update both sides together.

## Routes, state, and bundle boundaries

Use the existing `HashRouter`; it is intentional for Tauri asset-protocol deep links. Workspace surfaces live at `/workspace/:connectionId/diagram`, `/data`, and `/query`.

- Preserve nested route structure and lazy-load major workspace surfaces.
- Do not eagerly import React Flow or future editor engines into the shell bundle.
- URL state owns the active surface. Local state owns transient UI and editor drafts.
- Keep live connection/session state in the nearest workspace owner until a demonstrated cross-tree need justifies a store.
- Derive values during render. Use Effects only to synchronize with external systems, guard stale asynchronous results, and make Strict Mode replay safe.

## UI invariants

- Use Tailwind 4 and semantic CSS variables from `src/index.css`.
- Use shadcn components for controls and primitives; preserve Radix keyboard and focus behavior.
- Keep the developer-tool visual language compact, quiet, and high-density. Use amber for primary actions and emerald for live status; avoid decorative gradients and oversized dashboard cards.
- Preserve useful loading, empty, error, disconnected, read-only, and retry states.
- The table browser must remain usable without writing SQL: selecting a table loads rows, filtering stays responsive, nulls remain distinguishable, and large results are capped.
- Preserve accessible names, labels, keyboard shortcuts, focus visibility, reduced motion, and wide/narrow layouts.

## Data and query behavior

- Keep credentials and database URLs out of `VITE_*` variables and browser persistence.
- Read-only connections must reject write statements in both the client UX and Rust backend.
- Treat row limits as a safety boundary, not pagination. If pagination is added, define stable ordering and dialect-specific behavior.
- Export and clipboard actions operate only on currently loaded results and must not imply a full-table export.
- Avoid rendering database content through `innerHTML`; ordinary JSX escaping is required.

## Verify proportionally

Run from the project root with npm:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For meaningful UI changes, run the Vite app and exercise Diagram, Data, Query, and Connect flows. Check console errors, route-level chunk loading, keyboard behavior, empty/error states, and a narrower window. If the transport contract changes, also run `cargo test` and `cargo check` from `src-tauri`.

Report exact commands and outcomes, skipped checks, and remaining uncertainty. A successful Vite build does not prove Rust compilation or live database compatibility.
