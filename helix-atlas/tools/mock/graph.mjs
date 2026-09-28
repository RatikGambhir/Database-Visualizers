/** Deterministic development graph fixtures. */

const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Carla",
  "Dmitri",
  "Elena",
  "Farid",
  "Grace",
  "Hana",
  "Ivan",
  "Jules",
  "Kira",
  "Liam",
  "Maya",
  "Noor",
  "Omar",
  "Priya",
  "Quinn",
  "Rosa",
  "Sven",
  "Tara",
  "Uma",
  "Viktor",
  "Wren",
  "Xiu",
  "Yara",
  "Zane",
];
const TOPICS = [
  "graphs",
  "vectors",
  "rust",
  "storage",
  "retrieval",
  "agents",
  "indexing",
];
const CITIES = ["Berlin", "Lagos", "Osaka", "Lima", "Toronto", "Lisbon"];

/** Small deterministic PRNG so a given seed always builds the same graph. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildGraph(seed) {
  const random = makeRandom(seed);
  const nodes = new Map();
  const edges = new Map();
  let nextId = 1n;

  const addNode = (label, properties) => {
    const id = nextId++;
    nodes.set(id, { id, label, properties });
    return id;
  };
  const addEdge = (label, from, to, properties = {}) => {
    const id = nextId++;
    edges.set(id, { id, label, from, to, properties });
    return id;
  };

  const pick = (list) => list[Math.floor(random() * list.length)];

  const users = FIRST_NAMES.map((name, index) =>
    addNode("User", {
      name,
      handle: `@${name.toLowerCase()}`,
      age: 21 + Math.floor(random() * 32),
      city: pick(CITIES),
      verified: random() > 0.7,
      joined: 2018 + Math.floor(random() * 8),
      // One deliberately huge id-like value, to prove i64 survives the round trip.
      externalId: index === 0 ? 9223372036854775807n : BigInt(100000 + index),
    }),
  );

  const topics = TOPICS.map((title) =>
    addNode("Topic", { title, followers: Math.floor(random() * 900) }),
  );

  const posts = [];
  for (let index = 0; index < 40; index++) {
    posts.push(
      addNode("Post", {
        title: `Notes on ${pick(TOPICS)} #${index + 1}`,
        wordCount: 120 + Math.floor(random() * 1800),
        score: Math.round(random() * 100) / 10,
      }),
    );
  }

  const orgs = ["Helix Labs", "Northwind", "Acme Data"].map((name) =>
    addNode("Org", { name, employees: 12 + Math.floor(random() * 400) }),
  );

  for (const user of users) {
    const followCount = 1 + Math.floor(random() * 5);
    for (let i = 0; i < followCount; i++) {
      const other = pick(users);
      if (other !== user)
        addEdge("Follows", user, other, {
          since: 2019 + Math.floor(random() * 7),
        });
    }
    // A self-follow exercises the loop-drawing path in the renderer.
    if (random() > 0.93) addEdge("Follows", user, user, { since: 2024 });
    addEdge("WorksAt", user, pick(orgs), {
      role: pick(["eng", "research", "ops"]),
    });
    for (let i = 0; i < 1 + Math.floor(random() * 3); i++) {
      addEdge("Likes", user, pick(topics), {
        weight: Math.round(random() * 100) / 100,
      });
    }
  }

  for (const post of posts) {
    addEdge("AuthoredBy", post, pick(users), {});
    addEdge("About", post, pick(topics), {});
  }

  return { nodes, edges };
}
