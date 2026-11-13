// Event rules. Pure module, no DOM.
//
// Rule shape (one entry in RULES per event):
//   { id, priority, level, test(ctx) => boolean, message(ctx) => string }
//   - priority: higher wins the main banner; ties go to the earlier entry.
//   - level: "big" | "shout" | "comment" (effect = highest level fired).
//   - ctx = { rolls, players, last }; last is rolls.at(-1).
// To add an event, add one entry to RULES.

const LEVEL_RANK = { comment: 1, shout: 2, big: 3 };
const COMBO_WORDS = { 2: "DOUBLE", 3: "TRIPLE", 4: "SUPER", 5: "HYPER", 6: "BRUTAL", 7: "MASTER" };

/** Length of the trailing run of rolls sharing the same sum (0 if empty). */
export function trailingRunLength(rolls) {
  if (!rolls.length) return 0;
  const s = rolls.at(-1).sum;
  let n = 0;
  for (let i = rolls.length - 1; i >= 0 && rolls[i].sum === s; i--) n++;
  return n;
}

/** Number of rolls since the most recent 7 (or since game start). */
export function rollsSinceSeven(rolls) {
  let n = 0;
  for (let i = rolls.length - 1; i >= 0 && rolls[i].sum !== 7; i--) n++;
  return n;
}

/** The given player's most recent roll before the last one, or null. */
export function previousRollOf(rolls, player) {
  for (let i = rolls.length - 2; i >= 0; i--) {
    if (rolls[i].player === player) return rolls[i];
  }
  return null;
}

const comboText = (k) => (k >= 8 ? `ULTRA COMBO x${k}!` : `${COMBO_WORDS[k]} COMBO!`);
const isDoubles = (r) => r.dice[0] === r.dice[1];
const priorRun = (ctx) => trailingRunLength(ctx.rolls.slice(0, -1));

export const RULES = [
  {
    id: "serial-robber", priority: 100, level: "big",
    test: ({ rolls, last }) => last.sum === 7 && previousRollOf(rolls, last.player)?.sum === 7,
    message: ({ players, last }) => `${players[last.player]} is a SERIAL ROBBER!`,
  },
  {
    id: "combo", priority: 90, level: "shout",
    test: ({ rolls }) => trailingRunLength(rolls) >= 2,
    message: ({ rolls }) => comboText(trailingRunLength(rolls)),
  },
  {
    id: "combo-breaker", priority: 80, level: "shout",
    test: (ctx) => {
      const prior = ctx.rolls.slice(0, -1);
      return priorRun(ctx) >= 2 && prior.at(-1).sum !== ctx.last.sum;
    },
    message: () => "COMBO BREAKER!!",
  },
  {
    id: "seven", priority: 70, level: "big",
    test: ({ last }) => last.sum === 7,
    message: () => "ROBBER! Move it!",
  },
  {
    id: "snake-eyes", priority: 60, level: "shout",
    test: ({ last }) => last.dice[0] === 1 && last.dice[1] === 1,
    message: () => "SNAKE EYES!",
  },
  {
    id: "boxcars", priority: 60, level: "shout",
    test: ({ last }) => last.dice[0] === 6 && last.dice[1] === 6,
    message: () => "BOXCARS!",
  },
  {
    id: "doubles", priority: 30, level: "comment",
    test: ({ last }) => isDoubles(last) && last.dice[0] !== 1 && last.dice[0] !== 6,
    message: ({ last }) => `Doubles! Two ${last.dice[0]}s.`,
  },
  {
    id: "drought", priority: 20, level: "comment",
    test: ({ rolls }) => {
      const n = rollsSinceSeven(rolls);
      return n > 0 && n % 10 === 0;
    },
    message: ({ rolls }) => `${rollsSinceSeven(rolls)} rolls without a 7. The robber is sleeping...`,
  },
];

export function evaluateEvents(game, rules = RULES) {
  const none = { main: null, secondary: null, effect: "none" };
  const rolls = game.rolls;
  if (!rolls.length) return none;
  const ctx = { rolls, players: game.players, last: rolls.at(-1) };
  const fired = rules
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule }) => rule.test(ctx))
    .sort((a, b) => b.rule.priority - a.rule.priority || a.i - b.i)
    .map(({ rule }) => rule);
  if (!fired.length) return none;
  const toEvent = (r) => ({ id: r.id, level: r.level, text: r.message(ctx) });
  const effect = fired.reduce((best, r) => (LEVEL_RANK[r.level] > LEVEL_RANK[best] ? r.level : best), "comment");
  return { main: toEvent(fired[0]), secondary: fired[1] ? toEvent(fired[1]) : null, effect };
}
