// Pure game state for Catan Dice. No DOM, no RNG: callers pass dice in.

export const VERSION = 1;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_NAME_LENGTH = 20;

export function validateNames(names) {
  if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    return { ok: false, error: `Enter between ${MIN_PLAYERS} and ${MAX_PLAYERS} player names.` };
  }
  const seen = new Set();
  for (const raw of names) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (name === "") return { ok: false, error: "Player names cannot be empty." };
    if (name.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `Player names must be at most ${MAX_NAME_LENGTH} characters.` };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Duplicate player name: ${name}.` };
    seen.add(key);
  }
  return { ok: true };
}

export function createGame(names) {
  const v = validateNames(names);
  if (!v.ok) throw new Error(v.error);
  return { version: VERSION, players: names.map((n) => n.trim()), turn: 0, rolls: [] };
}

export function moveItem(list, index, dir) {
  const copy = list.slice();
  const j = index + dir;
  if ((dir !== -1 && dir !== 1) || index < 0 || index >= copy.length || j < 0 || j >= copy.length) {
    return copy;
  }
  [copy[index], copy[j]] = [copy[j], copy[index]];
  return copy;
}

function makeRoll([a, b], player) {
  return { dice: [a, b], sum: a + b, player };
}

export function applyRoll(game, dice) {
  const roll = makeRoll(dice, game.turn);
  return {
    ...game,
    players: game.players.slice(),
    rolls: [...game.rolls, roll],
    turn: (game.turn + 1) % game.players.length,
  };
}

export function rerollLast(game, dice) {
  if (game.rolls.length === 0) return game;
  const last = game.rolls[game.rolls.length - 1];
  return { ...game, rolls: [...game.rolls.slice(0, -1), makeRoll(dice, last.player)] };
}

export function undoLast(game) {
  if (game.rolls.length === 0) return game;
  const last = game.rolls[game.rolls.length - 1];
  return { ...game, rolls: game.rolls.slice(0, -1), turn: last.player };
}

export function shiftTurn(game, dir) {
  const n = game.players.length;
  return { ...game, turn: (((game.turn + dir) % n) + n) % n };
}

export function serialize(game) {
  return JSON.stringify(game);
}

const isDie = (d) => Number.isInteger(d) && d >= 1 && d <= 6;

export function deserialize(text) {
  try {
    const g = JSON.parse(text);
    if (!g || typeof g !== "object" || g.version !== VERSION) return null;
    const { players, turn, rolls } = g;
    if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) return null;
    if (!validateNames(players).ok) return null;
    if (!Number.isInteger(turn) || turn < 0 || turn >= players.length) return null;
    if (!Array.isArray(rolls)) return null;
    for (const r of rolls) {
      if (!r || !Array.isArray(r.dice) || r.dice.length !== 2 || !r.dice.every(isDie)) return null;
      if (r.sum !== r.dice[0] + r.dice[1]) return null;
      if (!Number.isInteger(r.player) || r.player < 0 || r.player >= players.length) return null;
    }
    return { version: VERSION, players, turn, rolls };
  } catch {
    return null;
  }
}
