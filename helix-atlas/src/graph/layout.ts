/**
 * Force-directed layout.
 *
 * A plain spring/repulsion model, with the repulsion term approximated by a
 * Barnes–Hut quadtree so the per-tick cost is O(n log n) rather than O(n²) —
 * that is what keeps a few thousand nodes interactive. Written by hand so the
 * app stays dependency-free and the renderer can drive the ticks itself.
 */
import { buildQuadtree, applyRepulsion } from "./quadtree";
import type { GraphData } from "../results";

export interface LayoutNode {
  id: string;
  label: string | null;
  properties: Record<string, unknown>;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Total incident edges, used for sizing and for label priority. */
  degree: number;
  /** Set while the user drags a node; the simulation stops moving it. */
  pinned: boolean;
  radius: number;
}

export interface LayoutEdge {
  id: string;
  label: string | null;
  source: LayoutNode;
  target: LayoutNode;
  /** Index among parallel edges between the same pair, for arc offsetting. */
  parallelIndex: number;
  parallelCount: number;
  /** True when source and target are the same node. */
  loop: boolean;
}

export interface LayoutOptions {
  /** Preferred edge length; everything else scales off this. */
  linkDistance: number;
  /** Repulsion strength between nodes. */
  charge: number;
  /** Pull towards the origin, which keeps disconnected components in frame. */
  gravity: number;
  /** Velocity retained between ticks. */
  damping: number;
  /** Barnes–Hut opening angle; larger is faster and rougher. */
  theta: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  linkDistance: 115,
  charge: 5200,
  gravity: 0.03,
  damping: 0.82,
  theta: 0.9,
};

/** Clear space kept between node rims so their captions have room. */
const COLLISION_PADDING = 14;

const MIN_RADIUS = 5;
const MAX_RADIUS = 22;

/** Deterministic PRNG, so the same graph always starts from the same layout. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of a node id, used to seed its starting position. */
function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class ForceLayout {
  readonly nodes: LayoutNode[] = [];
  readonly edges: LayoutEdge[] = [];
  readonly byId = new Map<string, LayoutNode>();
  options: LayoutOptions;

  /** Simulated annealing factor: high early, settling towards zero. */
  private alpha = 1;

  constructor(graph: GraphData, options: Partial<LayoutOptions> = {}) {
    this.options = { ...DEFAULT_LAYOUT, ...options };

    const degrees = new Map<string, number>();
    for (const edge of graph.edges) {
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }

    // Seed positions on a phyllotaxis spiral, jittered per id. A spiral spreads
    // nodes evenly, which converges far faster than uniform random placement.
    const random = makeRandom(0x5eed);
    const spacing = Math.max(this.options.linkDistance * 0.75, 40);
    graph.nodes.forEach((node, index) => {
      const angle = index * 2.399963229728653; // golden angle
      const radius = spacing * Math.sqrt(index);
      const jitter = (hashId(node.id) % 1000) / 1000 - 0.5;
      const degree = degrees.get(node.id) ?? 0;
      const layoutNode: LayoutNode = {
        id: node.id,
        label: node.label,
        properties: node.properties,
        x: Math.cos(angle) * radius + jitter * 12,
        y: Math.sin(angle) * radius + (random() - 0.5) * 12,
        vx: 0,
        vy: 0,
        degree,
        pinned: false,
        radius: nodeRadius(degree),
      };
      this.nodes.push(layoutNode);
      this.byId.set(node.id, layoutNode);
    });

    // Group parallel edges so they can be drawn as separate arcs.
    const pairCounts = new Map<string, number>();
    const pairKey = (a: string, b: string) => (a < b ? `${a}\0${b}` : `${b}\0${a}`);
    for (const edge of graph.edges) {
      const key = pairKey(edge.source, edge.target);
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }

    const pairSeen = new Map<string, number>();
    for (const edge of graph.edges) {
      const source = this.byId.get(edge.source);
      const target = this.byId.get(edge.target);
      if (!source || !target) continue;
      const key = pairKey(edge.source, edge.target);
      const index = pairSeen.get(key) ?? 0;
      pairSeen.set(key, index + 1);
      this.edges.push({
        id: edge.id,
        label: edge.label,
        source,
        target,
        parallelIndex: index,
        parallelCount: pairCounts.get(key) ?? 1,
        loop: source === target,
      });
    }
  }

  /** True once the simulation has cooled enough to stop ticking. */
  get settled(): boolean {
    return this.alpha < 0.005;
  }

  get progress(): number {
    return 1 - Math.max(0, Math.min(1, (this.alpha - 0.005) / (1 - 0.005)));
  }

  /** Reheats the simulation, e.g. after a drag or an options change. */
  reheat(to = 0.6): void {
    this.alpha = Math.max(this.alpha, to);
  }

  /** Advances the simulation one step. */
  tick(): void {
    if (this.nodes.length === 0) return;
    const { linkDistance, charge, gravity, damping, theta } = this.options;

    const tree = buildQuadtree(this.nodes);
    for (const node of this.nodes) {
      if (tree) applyRepulsion(node, tree, charge, theta);
      // Pull to the origin so components without edges do not drift away.
      node.vx -= node.x * gravity;
      node.vy -= node.y * gravity;
    }

    for (const edge of this.edges) {
      if (edge.loop) continue;
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      // Heavily connected nodes get stiffer springs, which pulls hubs inward.
      const stiffness = 0.12 / Math.min(edge.source.degree, edge.target.degree, 12);
      const force = (distance - linkDistance) * stiffness;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      edge.source.vx += fx;
      edge.source.vy += fy;
      edge.target.vx -= fx;
      edge.target.vy -= fy;
    }

    for (const node of this.nodes) {
      if (node.pinned) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx * this.alpha;
      node.y += node.vy * this.alpha;
    }

    this.separate();
    this.alpha *= 0.985;
  }

  /**
   * Pushes overlapping nodes apart.
   *
   * Repulsion alone lets dense clusters collapse into a single blob, because a
   * short spring can out-pull it. This resolves the remaining overlaps
   * positionally, using a spatial hash so only nearby pairs are considered.
   */
  private separate(): void {
    const cell = (MAX_RADIUS * 2 + COLLISION_PADDING) * 1.5;
    const buckets = new Map<string, LayoutNode[]>();
    for (const node of this.nodes) {
      const key = `${Math.floor(node.x / cell)},${Math.floor(node.y / cell)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(node);
      else buckets.set(key, [node]);
    }

    for (const node of this.nodes) {
      const cx = Math.floor(node.x / cell);
      const cy = Math.floor(node.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = buckets.get(`${cx + ox},${cy + oy}`);
          if (!bucket) continue;
          for (const other of bucket) {
            if (other === node) continue;
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const minimum = node.radius + other.radius + COLLISION_PADDING;
            const distance = Math.hypot(dx, dy);
            if (distance >= minimum) continue;

            // Nudge both nodes along the axis between them; coincident nodes
            // get an arbitrary but deterministic direction to break the tie.
            const overlap = (minimum - distance) / 2;
            const ux = distance > 0.01 ? dx / distance : (node.id < other.id ? -1 : 1);
            const uy = distance > 0.01 ? dy / distance : 0;
            if (!node.pinned) {
              node.x -= ux * overlap;
              node.y -= uy * overlap;
            }
            if (!other.pinned) {
              other.x += ux * overlap;
              other.y += uy * overlap;
            }
          }
        }
      }
    }
  }

  /** Runs enough ticks to reach a usable layout before the first paint. */
  warmUp(ticks = 90): void {
    for (let i = 0; i < ticks && !this.settled; i++) this.tick();
  }

  /** Axis-aligned bounds of the current layout, padded by the node radii. */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.nodes.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of this.nodes) {
      minX = Math.min(minX, node.x - node.radius);
      minY = Math.min(minY, node.y - node.radius);
      maxX = Math.max(maxX, node.x + node.radius);
      maxY = Math.max(maxY, node.y + node.radius);
    }
    return { minX, minY, maxX, maxY };
  }

  /** The node under a point in graph space, topmost (smallest) first. */
  nodeAt(x: number, y: number, tolerance = 4): LayoutNode | null {
    let best: LayoutNode | null = null;
    let bestDistance = Infinity;
    for (const node of this.nodes) {
      const distance = Math.hypot(node.x - x, node.y - y);
      if (distance <= node.radius + tolerance && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }
}

/** Node size grows with degree, flattening out so hubs stay on screen. */
export function nodeRadius(degree: number): number {
  return Math.min(MAX_RADIUS, MIN_RADIUS + Math.sqrt(degree) * 2.6);
}
