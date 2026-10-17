// Mulberry32: a small 32-bit generator. Not cryptographic, but fast, well
// distributed, and the same seed gives the same sequence on every platform.
// Returns numbers in [0, 1), like Math.random.
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher–Yates over 0..n-1. Shuffles indices instead of rows so callers can
// cut the same permutation into blocks without copying records.
export const shuffledIndices = (n: number, seed: number): number[] => {
  const random = seededRandom(seed)
  const indices = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = indices[i] as number
    indices[i] = indices[j] as number
    indices[j] = tmp
  }
  return indices
}
