# Database Visualizers

This repository contains the Tablescape and Helix Atlas desktop apps and a website for distributing macOS database visualizer applications. The `database-visualizer/` directory is the download site, not a database visualization app.

## Projects

| Directory | Purpose |
| --- | --- |
| [`Tablescape/`](./Tablescape/) | Source for Tablescape, a desktop database workbench built with React, Vite, Tauri, and Rust. |
| [`database-visualizer/`](./database-visualizer/) | Astro, React, and Tailwind landing page intended to provide macOS application downloads. |
| [`helix-atlas/`](./helix-atlas/) | Source for Helix Atlas, a HelixDB graph explorer built with React, Vite, Tauri, and Rust. |

Tablescape can open SQLite databases, connect to PostgreSQL and MySQL/MariaDB, import SQL files, visualize schemas, browse tables, and run queries. See the [Tablescape README](./Tablescape/README.md) for supported sources, features, and development instructions.

Helix Atlas can connect to HelixDB instances, explore graph data, inspect schemas, and run read-only HelixSQL queries. See the [Helix Atlas README](./helix-atlas/README.md) for features and development instructions.

## Download status

The landing page links to the Tablescape Apple Silicon DMG release. The Helix download button remains disabled until its release URL is available. No macOS installer binaries are included in this repository.

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

To run Helix Atlas as a desktop app with the same Node.js, Rust, and Tauri prerequisites:

```bash
cd helix-atlas
npm install
npm run app
```

Each directory has its own README with further setup and verification commands.
