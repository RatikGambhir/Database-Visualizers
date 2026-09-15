# Tuple

Tuple is a local-first relational database workbench built with React, Vite, Tauri, and Rust. It gives you a visual map of a database, direct table browsing, and a focused SQL workspace in one native desktop app.

## Features

- Open SQLite database files directly.
- Connect to PostgreSQL and MySQL/MariaDB with standard connection URLs.
- Import `.sql` files. SQLite-compatible dumps become browseable in memory; other dialects fall back to a static schema diagram.
- Explore schemas and foreign-key relationships in an interactive ER diagram.
- Click a table to browse its existing rows without writing SQL.
- Run SQL with read-only enforcement, history, result filtering, JSON copy, and CSV export.
- Route-level lazy loading for the diagram, data browser, and query workspace.
- Light and dark themes using a compact, Linear-inspired shadcn/Tailwind visual system.

Credentials are sent directly to the Rust process and are never stored in browser storage.

## Run

### Prerequisites

- Node.js 22.12 or newer
- Rust and Cargo
- The [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Start the desktop app

```bash
npm install
npm run tauri dev
```

Use `npm run dev` for the browser preview with the included sample commerce schema.

## Supported sources

| Source | Connection method | Schema | Browse data | Query |
| --- | --- | --- | --- | --- |
| SQLite | Local `.sqlite` or `.db` file | Yes | Yes | Yes |
| PostgreSQL | Connection URL | Yes | Yes | Yes |
| MySQL / MariaDB | Connection URL | Yes | Yes | Yes |
| SQL file | Local `.sql` file | Yes | SQLite-compatible imports | SQLite-compatible imports |

## Verify

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build

cd src-tauri
cargo test
cargo check
```

Install the Playwright browser once before the first E2E run:

```bash
npx playwright install chromium
```

## Backend domains

```text
src-tauri/src/
├── domains/
│   ├── connection/  # connection lifecycle and profiles
│   ├── query/       # query policy, execution, and row normalization
│   └── schema/      # introspection, DDL parsing, and SQL import
└── infrastructure/  # SQLx pools, driver setup, and error translation
```

PostgreSQL and MySQL adapters compile as part of the standard Rust checks. Live integration coverage currently uses SQLite so the suite remains deterministic and self-contained.

## Architecture

- `src/` contains the React application, route-level workspaces, shadcn UI primitives, and the typed Tauri API boundary.
- `src-tauri/` contains the Rust application, database domains, SQLx-backed drivers, and native commands.
- `tests/e2e/` contains Playwright workflows for the browser-preview experience.
