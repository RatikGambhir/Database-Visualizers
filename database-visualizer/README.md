# Database Visualizer

Astro + React + Tailwind CSS v4 + official shadcn/ui primitives. Recreates the supplied landing-page reference with locally served fonts and a CSS horizon.

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

- `src/pages/index.astro`: page, reference copy, metadata.
- `src/styles/global.css`: tokens, responsive layout, atmosphere.
- `src/components/download-buttons.tsx`: glowing shadcn download buttons.
- `src/components/ui/`: official shadcn primitives.

The macOS download buttons are intentionally disabled until official release URLs are available. No signup backend or database workspace is connected.

Setup follows the official [Astro guide](https://docs.astro.build/en/install-and-setup/) and [shadcn Astro guide](https://ui.shadcn.com/docs/installation/astro).
