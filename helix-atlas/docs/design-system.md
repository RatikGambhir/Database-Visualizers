# Atlas visual system

Helix Atlas is a read-only workbench for developers exploring HelixDB. The three
primary surfaces remain Query, Schema, and Graph. Connection and theme controls
are global; reference material and inspection belong to the active workspace.

## Direction

A cartographic instrument: warm paper in light mode, graphite in dark mode, and
copper for actions and selection. Categorical graph colors retain their separate
meaning. The compass mark and explanatory network drawing reinforce exploration;
the welcome drawing is decorative, not a database result.

Avenir Next (with Trebuchet fallback) supplies compact interface typography.
Iowan Old Style / Palatino / Georgia distinguishes workspace and welcome titles.
Native monospace fonts are reserved for code, metadata, and compact labels. No
font network request is required.

## Ownership

- `src/styles/base.css`: shared color, typography, spacing, radius, and frame tokens.
- `src/redesign.css`: workspace compositions and responsive adaptations over the
  existing feature styles.
- `src/graph/palette.ts`: canvas colors, kept aligned with the surface tokens.
- `ConnectionBar`: global navigation and connection controls; preserves the Radix dialog.
- `GraphWelcome`: disconnected onboarding, with one connection action.
- Existing workspace and inspector owners retain data rendering and interactions.

Use tonal surfaces and dividing rules to group data. Avoid nested cards and
unnecessary shadows. Reserve shadows for dialogs and modest graph-node elevation.
Use Lucide for interface icons. Keep visible focus, disabled feedback, loading,
empty, and error states. Motion follows reduced-motion preferences.

## Responsive behavior

Desktop uses an 82px navigation rail, a 64px header, and a compact status strip.
At 1200px, the query inspector moves below the editor instead of disappearing.
At 900px, the graph inspector follows the canvas. At 600px, primary navigation
becomes a horizontal row, query references collapse behind an explicit control,
and all inspector details remain available by scrolling. Wide result/property
tables retain horizontal scrolling.

## Verification scope

The redesign preserves Rust IPC, query compilation, connection persistence,
read-only enforcement, and graph selection/session state. Browser-only mode
continues to disable native commands. Visual fixture testing is not evidence of
live HelixDB connectivity; use the Tauri application for that validation.
