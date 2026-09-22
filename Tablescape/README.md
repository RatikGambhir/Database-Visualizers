# Tablescape

Tablescape is a local-first desktop workbench for exploring relational databases. It combines an interactive schema diagram, a table browser, and a focused SQL workspace in one native app built with React, Tauri, and Rust.

## What you can do

- Open local SQLite databases (`.db`, `.sqlite`, and `.sqlite3`).
- Connect to PostgreSQL and MySQL/MariaDB with a connection URL.
- Import `.sql` files to inspect their schema without a running database.
- Explore tables, columns, primary keys, and foreign-key relationships in an interactive diagram.
- Select a table to browse its rows without writing SQL.
- Run SQL, review session history, filter results, copy rows as JSON, and export CSV files.
- Use read-only connections to prevent mutation statements from being executed.
- Switch between light and dark themes.

Connection credentials are passed directly to the native Rust process. Tablescape does not store them in browser storage.

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 22.12 or newer
- [Rust and Cargo](https://www.rust-lang.org/tools/install)
- The [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system

Install the dependencies and start the desktop app:

```bash
npm install
npm run tauri dev
```

To explore the interface without launching the native app, run:

```bash
npm run dev
```

The browser preview uses an included sample commerce schema. Opening local files and connecting to real databases require the Tauri desktop app.

## Connect a database

Choose **Add connection** in the sidebar, name the connection, and select a mode:

- **Read only** blocks common data- and schema-changing statements.
- **Editable** allows statements supported by the connected database.

For PostgreSQL and MySQL/MariaDB, enter a standard connection URL:

```text
postgresql://user:password@localhost:5432/database
mysql://user:password@localhost:3306/database
```

SQLite databases are selected with the native file picker. SQL files can also be imported from the connection dialog; SQLite-compatible dumps are loaded into an in-memory database, while other dialects are available as static schema diagrams.

## Supported sources

| Source | Connection method | Schema diagram | Browse data | Run queries |
| --- | --- | :---: | :---: | :---: |
| SQLite | Local database file | Yes | Yes | Yes |
| PostgreSQL | Connection URL | Yes | Yes | Yes |
| MySQL / MariaDB | Connection URL | Yes | Yes | Yes |
| SQLite-compatible SQL file | Local `.sql` file | Yes | Yes | Yes |
| Other SQL file | Local `.sql` file | Yes | No | No |

Query results are limited to 500 rows in the current interface. The active connection and query history live only for the current app session.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite browser preview |
| `npm run tauri dev` | Start the native app in development mode |
| `npm run build` | Type-check and create the frontend production build |
| `npm run typecheck` | Run the TypeScript compiler without emitting files |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest unit and component tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run the Playwright end-to-end tests |

Install the Playwright browser once before the first end-to-end test run:

```bash
npx playwright install chromium
```

Run the Rust checks from the native application directory:

```bash
cd src-tauri
cargo test
cargo check
```

## Architecture

```text
Tablescape/
├── src/
│   ├── components/ui/       # shared interface primitives
│   ├── features/database/   # diagram, browser, inspector, and query UI
│   └── lib/                 # typed native API boundary and shared models
├── src-tauri/
│   ├── src/domains/
│   │   ├── connection/     # connection lifecycle and profiles
│   │   ├── query/          # query policy, execution, and row normalization
│   │   └── schema/         # introspection, DDL parsing, and SQL import
│   └── src/infrastructure/  # SQLx pools, drivers, and error translation
└── tests/e2e/                # browser-preview Playwright workflows
```

The frontend communicates with the native process through a small typed Tauri command boundary. The Rust backend uses SQLx for SQLite, PostgreSQL, and MySQL/MariaDB. Live automated database coverage uses SQLite so the test suite remains deterministic and self-contained; the PostgreSQL and MySQL adapters are compiled by the standard Rust checks.

## Security notes

- New connections default to read-only mode.
- Read-only enforcement runs in the Rust backend as well as the interface.
- Connection details remain in process memory for the current session and are not persisted by Tablescape.
- The desktop window uses a restrictive content security policy and exposes only the native dialog permission required for file selection.

Treat database URLs as secrets: avoid committing them to source control, shell history, screenshots, or bug reports.
