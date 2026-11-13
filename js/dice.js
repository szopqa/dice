// Pure dice logic — no DOM access, so it's easy to test and reuse.

/**
 * Returns a uniformly distributed integer in [1, sides].
 * Uses crypto.getRandomValues with rejection sampling to avoid modulo bias.
 */
export function rollDie(sides) {
  const max = 2 ** 32;
  const limit = max - (max % sides);
  const buffer = new Uint32Array(1);

  let value;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return (value % sides) + 1;
}

/** Rolls `count` dice with `sides` faces each. */
export function rollDice(count, sides) {
  return Array.from({ length: count }, () => rollDie(sides));
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
