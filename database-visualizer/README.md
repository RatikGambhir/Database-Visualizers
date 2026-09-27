# Database Visualizer download site

This is the landing page for distributing macOS database visualizer applications. It is built with Astro, React, Tailwind CSS v4, and shadcn/ui primitives. The site will provide downloads for published application binaries; the database workspace itself lives in the desktop apps.

## Run

Use Node 24 and npm.

```sh
npm ci
npm run dev -- --background
```

Stop the server with `npx astro dev stop`.

## Verify

```sh
npm run check
npm run build
npm run preview
```

## Source

- `src/pages/index.astro`: page composition, metadata, and section layout.
- `src/data/apps.ts`: app names, copy, features, and release URLs (set `url` to enable a download button).
- `src/styles/global.css`: design tokens (color, type, space, motion) and the shared download button styles.
- `src/components/ProductWindow.astro`: hero preview with Tablescape (`SchemaDiagram.astro`) and Helix Visualizer (`GraphDiagram.astro`) views.
- `src/components/AppSpec.astro`, `SourcesTable.astro`, `SiteHeader.astro`, `SiteFooter.astro`, `Logo.astro`: page sections.
- `src/components/download-buttons.tsx`: shadcn-based download buttons, enabled when a release URL exists.
- `src/components/ui/`: official shadcn primitives.

The Tablescape button links to the Apple Silicon DMG release. The Helix Visualizer button remains disabled until its release URL is available. No installer binaries, signup backend, or database workspace are included in this site.

Setup follows the official [Astro guide](https://docs.astro.build/en/install-and-setup/) and [shadcn Astro guide](https://ui.shadcn.com/docs/installation/astro).
