export type AppId = 'tablescape' | 'helix';

export interface DesktopApp {
  id: AppId;
  name: string;
  /** Official macOS release URL. Leave undefined until a build is published. */
  url?: string;
  kicker: string;
  summary: string;
  sources: string[];
  /** Wrap code in backticks inside `detail`. */
  features: { term: string; detail: string }[];
  note: string;
}

// Add the official macOS release URLs when they are available.
export const apps: DesktopApp[] = [
  {
    id: 'tablescape',
    name: 'Tablescape',
    kicker: 'For relational databases',
    summary: 'A local-first workbench that turns tables and foreign keys into a diagram you can read, then lets you browse and query without switching tools.',
    sources: ['SQLite', 'PostgreSQL', 'MySQL / MariaDB', '.sql files'],
    features: [
      { term: 'Schema diagram', detail: 'Tables, columns, primary keys and foreign-key relationships, laid out and interactive.' },
      { term: 'Table browser', detail: 'Select a table to browse its rows without writing SQL.' },
      { term: 'SQL workspace', detail: 'Run queries, filter results, copy rows as JSON, export CSV, and revisit session history.' },
      { term: 'Read-only mode', detail: 'Block data- and schema-changing statements on connections you don’t want to touch.' },
    ],
    note: 'Credentials go straight to the native Rust process and are never kept in browser storage.',
  },
  {
    id: 'helix',
    name: 'Helix Visualizer',
    kicker: 'For HelixDB graphs',
    summary: 'Pull nodes, edges and their relationships out of a HelixDB instance and see the structure of the whole graph at once.',
    sources: ['Local instance', 'Network host', 'HTTPS / cloud'],
    features: [
      { term: 'Graph view', detail: 'Force-directed canvas with pan, zoom, drag, per-label colour and neighbourhood focus on hover.' },
      { term: 'HelixSQL', detail: 'A small SQL-like dialect — `SELECT … FROM NODES … TRAVERSE OUT` — compiled to HelixDB’s traversal AST.' },
      { term: 'Inspector', detail: 'Click a node or edge for its properties, incident edges, neighbours and degree.' },
      { term: 'Wire format', detail: 'See the exact JSON sent to `/v1/query`. Nothing about the translation is hidden.' },
    ],
    note: 'Read-only by construction: the query compiler can only emit reads.',
  },
];
