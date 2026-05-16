// Run with: deno test supabase/functions/cluster-embeddings/kmeans.test.ts

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { kmeans, normalize, suggestK } from "./kmeans.ts";

// Seeded PRNG so cluster assignments are deterministic across runs.
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

Deno.test("kmeans separates three obvious directional clusters", () => {
  // 3 groups, each tightly clustered around a unit axis direction.
  const groupA = [
    [1.0, 0.05, 0.02],
    [0.98, 0.03, -0.01],
    [0.99, -0.04, 0.05],
    [1.0, 0.0, 0.0],
  ];
  const groupB = [
    [0.05, 1.0, 0.0],
    [-0.02, 0.98, 0.04],
    [0.04, 0.99, -0.03],
    [0.0, 1.0, 0.05],
  ];
  const groupC = [
    [0.0, 0.05, 1.0],
    [0.04, -0.03, 0.99],
    [-0.05, 0.02, 0.98],
    [0.0, 0.0, 1.0],
  ];
  const points = [...groupA, ...groupB, ...groupC];

  const { assignments } = kmeans(points, 3, makeRand(42));

  // All points within a group share an assignment.
  for (let i = 1; i < 4; i++) {
    assertEquals(assignments[i], assignments[0], `groupA point ${i}`);
  }
  for (let i = 5; i < 8; i++) {
    assertEquals(assignments[i], assignments[4], `groupB point ${i - 4}`);
  }
  for (let i = 9; i < 12; i++) {
    assertEquals(assignments[i], assignments[8], `groupC point ${i - 8}`);
  }

  // Groups land in distinct clusters.
  assertNotEquals(assignments[0], assignments[4]);
  assertNotEquals(assignments[0], assignments[8]);
  assertNotEquals(assignments[4], assignments[8]);
});

Deno.test("normalize produces unit vectors", () => {
  const v = normalize([3, 4]);
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  assertEquals(Math.round(len * 1e6) / 1e6, 1);
});

Deno.test("normalize is a no-op on the zero vector", () => {
  const v = normalize([0, 0, 0]);
  assertEquals(v, [0, 0, 0]);
});

Deno.test("suggestK clamps to [2, 8]", () => {
  assertEquals(suggestK(0), 2);
  assertEquals(suggestK(4), 2);
  assertEquals(suggestK(50), 5);
  assertEquals(suggestK(200), 8);
  assertEquals(suggestK(10000), 8);
});
