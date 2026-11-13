// Pure dice logic — no DOM access, so it's easy to test and reuse.

/** Default source: one uint32 from crypto.getRandomValues. */
function defaultRandomUint32() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * Returns a uniformly distributed integer in [1, sides].
 * Uses crypto.getRandomValues with rejection sampling to avoid modulo bias.
 */
export function rollDie(sides, randomUint32 = defaultRandomUint32) {
  const max = 2 ** 32;
  const limit = max - (max % sides);

  let value;
  do {
    value = randomUint32();
  } while (value >= limit);

  return (value % sides) + 1;
}

/** Rolls `count` dice with `sides` faces each. */
export function rollDice(count, sides) {
  return Array.from({ length: count }, () => rollDie(sides));
}

/** Rolls two six-sided dice; optional injected uint32 source. */
export function rollPair(randomUint32 = defaultRandomUint32) {
  return [rollDie(6, randomUint32), rollDie(6, randomUint32)];
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
