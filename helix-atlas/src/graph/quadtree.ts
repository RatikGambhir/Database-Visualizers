import type { LayoutNode } from "./layout";

// ---------------------------------------------------------------------------
// Barnes–Hut quadtree
// ---------------------------------------------------------------------------

interface QuadNode {
  /** Centre of mass. */
  cx: number;
  cy: number;
  mass: number;
  /** Half-width of the covered square. */
  half: number;
  /** Origin of the covered square. */
  x: number;
  y: number;
  children: (QuadNode | null)[] | null;
  leaf: LayoutNode | null;
}

export function buildQuadtree(nodes: LayoutNode[]): QuadNode | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) * 1.02;

  const root = makeQuad(minX, minY, size / 2);
  for (const node of nodes) insert(root, node, 0);
  return root;
}

function makeQuad(x: number, y: number, half: number): QuadNode {
  return { cx: 0, cy: 0, mass: 0, half, x, y, children: null, leaf: null };
}

const MAX_DEPTH = 24;

function insert(quad: QuadNode, node: LayoutNode, depth: number): void {
  // Accumulate the centre of mass on the way down.
  quad.cx = (quad.cx * quad.mass + node.x) / (quad.mass + 1);
  quad.cy = (quad.cy * quad.mass + node.y) / (quad.mass + 1);
  quad.mass += 1;

  if (quad.children === null) {
    if (quad.leaf === null) {
      quad.leaf = node;
      return;
    }
    // Coincident nodes would subdivide forever; keep them in one bucket.
    if (depth >= MAX_DEPTH) return;
    const existing = quad.leaf;
    quad.leaf = null;
    quad.children = [null, null, null, null];
    placeInChild(quad, existing, depth);
  }
  placeInChild(quad, node, depth);
}

function placeInChild(quad: QuadNode, node: LayoutNode, depth: number): void {
  const half = quad.half / 2;
  const east = node.x >= quad.x + quad.half ? 1 : 0;
  const south = node.y >= quad.y + quad.half ? 1 : 0;
  const index = south * 2 + east;
  const children = quad.children!;
  if (children[index] === null) {
    children[index] = makeQuad(
      quad.x + east * quad.half,
      quad.y + south * quad.half,
      half,
    );
  }
  insert(children[index]!, node, depth + 1);
}

export function applyRepulsion(
  node: LayoutNode,
  quad: QuadNode,
  charge: number,
  theta: number,
): void {
  if (quad.mass === 0) return;
  if (quad.leaf === node && quad.mass === 1) return;

  const dx = quad.cx - node.x;
  const dy = quad.cy - node.y;
  const distanceSquared = dx * dx + dy * dy;

  // Treat a distant cluster as a single body once it subtends a small angle.
  const width = quad.half * 2;
  if (
    quad.children === null ||
    (width * width) / Math.max(distanceSquared, 1e-6) < theta * theta
  ) {
    // The softening term keeps coincident nodes from producing infinite force.
    const softened = Math.max(distanceSquared, 25);
    const force = (-charge * quad.mass) / (softened * Math.sqrt(softened));
    node.vx += dx * force;
    node.vy += dy * force;
    return;
  }

  for (const child of quad.children) {
    if (child) applyRepulsion(node, child, charge, theta);
  }
}
