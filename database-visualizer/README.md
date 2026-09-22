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

- `src/pages/index.astro`: landing page and metadata.
- `src/styles/global.css`: tokens, responsive layout, atmosphere.
- `src/components/download-buttons.tsx`: glowing shadcn download buttons.
- `src/components/ui/`: official shadcn primitives.

The macOS download buttons are currently disabled until official release URLs are available. No installer binaries, signup backend, or database workspace are included in this site yet.

Setup follows the official [Astro guide](https://docs.astro.build/en/install-and-setup/) and [shadcn Astro guide](https://ui.shadcn.com/docs/installation/astro).
