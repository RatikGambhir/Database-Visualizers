# Database Visualizers

This repository contains the Tablescape desktop app and a website for distributing macOS database visualizer applications. The `database-visualizer/` directory is the download site, not a database visualization app.

## Projects

| Directory | Purpose |
| --- | --- |
| [`Tablescape/`](./Tablescape/) | Source for Tablescape, a desktop database workbench built with React, Vite, Tauri, and Rust. |
| [`database-visualizer/`](./database-visualizer/) | Astro, React, and Tailwind landing page intended to provide macOS application downloads. |

Tablescape can open SQLite databases, connect to PostgreSQL and MySQL/MariaDB, import SQL files, visualize schemas, browse tables, and run queries. See the [Tablescape README](./Tablescape/README.md) for supported sources, features, and development instructions.

The site is also intended to distribute Helix Visualizer for macOS. Its source lives in the separate [`helix-test` repository](https://github.com/RatikGambhir/helix-test).

## Download status

The landing page has macOS download buttons, but they are currently disabled until official release URLs are available. No macOS installer binaries are included in this repository yet.

## Run locally

Use Node.js 24 for the download site:

```bash
cd database-visualizer
npm ci
npm run dev -- --background
```

To run Tablescape as a desktop app, install Node.js 22.12 or newer, Rust, and the [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/):

```bash
cd Tablescape
npm install
npm run tauri dev
```

Each directory has its own README with further setup and verification commands.
