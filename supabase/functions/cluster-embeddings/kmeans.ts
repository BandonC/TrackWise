// Pure K-means with k-means++ init, using cosine distance on unit-norm
// vectors. No Deno or Supabase imports — keeps this trivially unit-testable.
//
// Voyage embeddings are not guaranteed unit-norm; we normalize on input so
// dot product == cosine similarity, and cosine distance == 1 - dot.

export type Vector = readonly number[];

export type ClusterResult = {
  // assignments[i] is the cluster index (0..k-1) of input vector i.
  assignments: number[];
  // centroids[c] is the mean unit vector of cluster c.
  centroids: number[][];
};

const MAX_ITERATIONS = 50;

export function normalize(v: Vector): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return v.slice();
  return v.map((x) => x / norm);
}

function dot(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Cosine distance for unit vectors: 1 - dot. Range [0, 2].
function cosineDistance(a: Vector, b: Vector): number {
  return 1 - dot(a, b);
}

function nearestCentroidIdx(point: Vector, centroids: number[][]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const d = cosineDistance(point, centroids[c]);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

// k-means++ seeding. `rand` is injectable for deterministic tests.
function seedCentroids(
  points: number[][],
  k: number,
  rand: () => number,
): number[][] {
  const centroids: number[][] = [];
  // First centroid: uniform random.
  const firstIdx = Math.floor(rand() * points.length);
  centroids.push(points[firstIdx].slice());

  while (centroids.length < k) {
    const sqDistances = points.map((p) => {
      const d = cosineDistance(p, centroids[nearestCentroidIdx(p, centroids)]);
      return d * d;
    });
    const total = sqDistances.reduce((a, b) => a + b, 0);
    if (total === 0) {
      // All remaining points coincide with chosen centroids. Pick any.
      centroids.push(points[Math.floor(rand() * points.length)].slice());
      continue;
    }
    let target = rand() * total;
    let chosen = 0;
    for (let i = 0; i < sqDistances.length; i++) {
      target -= sqDistances[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push(points[chosen].slice());
  }
  return centroids;
}

function meanUnitVector(members: number[][], dim: number): number[] {
  const sum = new Array<number>(dim).fill(0);
  for (const m of members) {
    for (let i = 0; i < dim; i++) sum[i] += m[i];
  }
  for (let i = 0; i < dim; i++) sum[i] /= members.length;
  return normalize(sum);
}

export function kmeans(
  rawPoints: Vector[],
  k: number,
  rand: () => number = Math.random,
): ClusterResult {
  if (k < 1) throw new Error("k must be >= 1");
  if (rawPoints.length < k) {
    throw new Error(`need at least k=${k} points, got ${rawPoints.length}`);
  }
  const dim = rawPoints[0].length;
  if (dim === 0) throw new Error("vectors must be non-empty");

  const points = rawPoints.map(normalize);
  let centroids = seedCentroids(points, k, rand);
  let assignments = new Array<number>(points.length).fill(-1);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Assign step.
    let changed = false;
    const next = points.map((p) => nearestCentroidIdx(p, centroids));
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== assignments[i]) changed = true;
    }
    assignments = next;
    if (!changed && iter > 0) break;

    // Update step.
    const newCentroids: number[][] = [];
    for (let c = 0; c < k; c++) {
      const members = points.filter((_, i) => assignments[i] === c);
      if (members.length === 0) {
        // Empty cluster: re-seed from a random point so k clusters survive.
        newCentroids.push(points[Math.floor(rand() * points.length)].slice());
      } else {
        newCentroids.push(meanUnitVector(members, dim));
      }
    }
    centroids = newCentroids;
  }

  return { assignments, centroids };
}

// Suggested k given n embedded rows. Caps at 8 to keep labels readable on
// the analytics card; floors at 2 because k=1 is degenerate.
export function suggestK(n: number): number {
  const raw = Math.floor(Math.sqrt(n / 2));
  return Math.min(8, Math.max(2, raw));
}
