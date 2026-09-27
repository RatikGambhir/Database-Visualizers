// Design harness only: fakes the Tauri IPC boundary with canned view models.
const params = new URLSearchParams(location.search);
const LATENCY = Number(params.get("latency") ?? 250);
const FAIL = params.get("fail"); // "graph" | "schema" | "connect"
const EMPTY = params.has("empty");

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(42); const pick = (l) => l[Math.floor(r() * l.length)];
const NAMES = ["Alice","Bob","Carla","Dmitri","Elena","Farid","Grace","Hana","Ivan","Jules","Kira","Liam","Maya","Noor","Omar","Priya","Quinn","Rosa","Sven","Tara","Uma","Viktor","Wren","Xiu","Yara","Zane"];
const TOPICS = ["graphs","vectors","rust","storage","retrieval","agents","indexing"];
const CITIES = ["Berlin","Lagos","Osaka","Lima","Toronto","Lisbon"];
let id = 1; const nodes = []; const edges = [];
const node = (label, properties) => { const n = { id: String(id++), label, properties }; nodes.push(n); return n; };
const edge = (label, a, b, properties = {}) => { const e = { id: String(id++), label, source: a.id, target: b.id, properties }; edges.push(e); return e; };
const users = NAMES.map((name, i) => node("User", { name, handle: "@" + name.toLowerCase(), age: 21 + Math.floor(r() * 32), city: pick(CITIES), verified: r() > 0.7, externalId: i === 0 ? "9223372036854775807" : 100000 + i }));
const topics = TOPICS.map((title) => node("Topic", { title, followers: Math.floor(r() * 900) }));
const posts = Array.from({ length: 40 }, (_, i) => node("Post", { title: `Notes on ${pick(TOPICS)} #${i + 1}`, wordCount: 120 + Math.floor(r() * 1800), score: Math.round(r() * 100) / 10 }));
const orgs = ["Helix Labs","Northwind","Acme Data"].map((name) => node("Org", { name, employees: 12 + Math.floor(r() * 400) }));
for (const u of users) { for (let i = 0; i < 1 + Math.floor(r() * 4); i++) { const o = pick(users); if (o !== u) edge("Follows", u, o, { since: 2019 + Math.floor(r() * 7) }); } edge("WorksAt", u, pick(orgs), { role: pick(["eng","research","ops"]) }); for (let i = 0; i < 1 + Math.floor(r() * 2); i++) edge("Likes", u, pick(topics), { weight: Math.round(r() * 100) / 100 }); }
for (const p of posts) { edge("AuthoredBy", p, pick(users)); edge("About", p, pick(topics)); }

const count = (list) => { const m = new Map(); for (const x of list) m.set(x.label, (m.get(x.label) ?? 0) + 1); return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count); };
const fieldsFor = (list) => { const props = new Map(); for (const x of list.slice(0, 20)) for (const [k, v] of Object.entries(x.properties ?? {})) { const f = props.get(k) ?? { name: k, types: [typeof v === "number" ? (Number.isInteger(v) ? "integer" : "float") : typeof v], values: [], presentOn: 0 }; f.presentOn++; if (f.values.length < 3 && !f.values.includes(v)) f.values.push(v); props.set(k, f); } return [...props.values()]; };
const schema = {
  sample: 5000,
  nodeLabels: count(nodes).map(({ label, count }) => ({ label, count, browseQuery: `SELECT * FROM NODES:${label} LIMIT 100`, graphQuery: `QUERY NODES:${label} LIMIT 300`, fields: fieldsFor(nodes.filter((n) => n.label === label)), fieldSample: Math.min(20, count) })),
  edgeLabels: count(edges).map(({ label, count }) => ({ label, count, browseQuery: `SELECT id, label, source, target FROM EDGES:${label} LIMIT 100`, graphQuery: `QUERY VIA ${label} LIMIT 300`, fields: fieldsFor(edges.filter((e) => e.label === label)), fieldSample: Math.min(20, count) })),
};
schema.edgeLabels[4].fieldError = "timeout after 30000 ms";

let connection = { url: "http://127.0.0.1:6969", hasApiKey: false, timeoutMs: 30000, writerOnly: false };
const delay = (v, ms = LATENCY) => new Promise((res) => setTimeout(() => res(v), ms));
const fail = (payload, ms = LATENCY) => new Promise((_, rej) => setTimeout(() => rej(payload), ms));

function compile(source) {
  const s = source.trim();
  const bad = s.match(/\bFORM\b/i) || s.match(/\bSELCT\b/i);
  if (bad) { const start = bad.index; const before = s.slice(0, start); const line = before.split("\n").length; const column = start - before.lastIndexOf("\n"); return { error: { kind: "parse", message: `unexpected identifier '${bad[0]}'`, span: { start, end: start + bad[0].length, line, column }, hint: "did you mean FROM?" } }; }
  const summary = /^(QUERY|GRAPH)/i.test(s) ? "graph of nodes (≤300 nodes, ≤2000 edges)" : /^SHOW STATS/i.test(s) ? "instance statistics" : /COUNT\(\*\)/i.test(s) ? "count grouped by label" : /^DESCRIBE/i.test(s) ? "entity with relationships" : "selected properties of nodes";
  return { compiled: { summary, transportJson: JSON.stringify({ request_type: "read", query: { queries: [{ Query: { steps: [{ NWhere: { Eq: ["$label", { String: "User" }] } }, { Limit: 300 }] } }] } }, null, 2) } };
}

function run(source) {
  const s = source.trim();
  const c = compile(s);
  if (c.error) return { error: c.error };
  let result;
  if (/^(QUERY|GRAPH)/i.test(s)) {
    if (FAIL === "graph") return { error: { kind: "http", message: "HelixDB responded with HTTP 502", detail: "upstream connect error or disconnect/reset before headers" } };
    result = { kind: "graph", graph: EMPTY ? { nodes: [], edges: [], danglingEdges: 0, truncatedNodes: false, truncatedEdges: false } : { nodes, edges: edges.map(({ properties, ...e }) => e), danglingEdges: 3, truncatedNodes: false, truncatedEdges: false } };
  } else if (/^SHOW STATS/i.test(s)) {
    result = { kind: "stats", nodeCount: nodes.length, edgeCount: edges.length, nodeLabels: count(nodes), edgeLabels: count(edges) };
  } else if (/^SHOW LABELS/i.test(s)) {
    result = { kind: "labels", nodes: count(nodes), edges: count(edges) };
  } else if (/COUNT\(\*\)\s+FROM\s+NODES\s+GROUP/i.test(s)) {
    result = { kind: "groupCount", by: "label", groups: count(nodes) };
  } else if (/COUNT\(\*\)/i.test(s)) {
    result = { kind: "count", value: 26 };
  } else if (/^DESCRIBE\s+(NODE|EDGE)\s+(\d+)/i.test(s)) {
    const [, kind, eid] = s.match(/^DESCRIBE\s+(NODE|EDGE)\s+(\d+)/i);
    if (kind.toUpperCase() === "NODE") {
      const n = nodes.find((x) => x.id === eid) ?? nodes[0];
      const inc = edges.filter((e) => e.source === n.id || e.target === n.id);
      const nb = [...new Set(inc.map((e) => (e.source === n.id ? e.target : e.source)))].map((x) => nodes.find((y) => y.id === x));
      result = { kind: "describe", entity: "nodes", id: n.id, label: n.label, properties: n.properties, edges: inc.slice(0, 6).map(({ properties, ...e }) => e), neighbours: nb.map(({ properties, ...x }) => ({ ...x, properties: {} })), degree: inc.length, endpoints: null };
    } else {
      const e = edges.find((x) => x.id === eid) ?? edges[0];
      const src = nodes.find((x) => x.id === e.source); const tgt = nodes.find((x) => x.id === e.target);
      result = { kind: "describe", entity: "edges", id: e.id, label: e.label, properties: e.properties, edges: [], neighbours: [], degree: null, endpoints: { source: src, target: tgt } };
    }
  } else if (/FROM\s+EDGES/i.test(s)) {
    result = { kind: "rows", columns: ["id", "label", "source", "target"], rows: edges.slice(0, 50).map((e) => ({ id: e.id, label: e.label, source: e.source, target: e.target })) };
  } else {
    const us = nodes.filter((n) => n.label === "User");
    result = { kind: "rows", columns: ["id", "label", "name", "handle", "age", "city", "verified", "externalId"], rows: us.map((n) => ({ id: n.id, label: n.label, ...n.properties })) };
  }
  return { execution: { result, durationMs: 8 + Math.floor(Math.random() * 20), compiled: c.compiled } };
}

window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
  transformCallback: (cb) => { const idn = Math.floor(Math.random() * 1e9); window[`_${idn}`] = cb; return idn; },
  invoke(cmd, args) {
    switch (cmd) {
      case "get_connection": return delay(connection, 10);
      case "set_connection": connection = { ...connection, url: args.update.url, timeoutMs: args.update.timeoutMs, writerOnly: args.update.writerOnly, hasApiKey: args.update.apiKey ? true : args.update.apiKey === "" ? false : connection.hasApiKey }; return delay(connection, 50);
      case "test_connection": return FAIL === "connect" ? fail({ kind: "transport", message: "Could not reach http://127.0.0.1:6969", detail: "connection refused (os error 61)" }, 600) : delay({ durationMs: 11 }, 600);
      case "compile_query": { const c = compile(args.source); return c.error ? fail(c.error, 5) : delay(c.compiled, 5); }
      case "run_query": { const x = run(args.source); return x.error ? fail(x.error) : delay(x.execution); }
      case "load_schema": return FAIL === "schema" ? fail({ kind: "http", message: "Schema sampling failed", detail: "HTTP 500" }) : delay({ schema: EMPTY ? { sample: 5000, nodeLabels: [], edgeLabels: [] } : schema, durationMs: 42 }, 700);
      default: return Promise.reject({ kind: "backend", message: `unknown command ${cmd}` });
    }
  },
};
