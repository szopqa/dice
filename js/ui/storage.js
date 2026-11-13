// localStorage wrapper: every access is guarded (private mode, quota, corrupt data).
import { deserialize, serialize, MIN_PLAYERS, MAX_PLAYERS } from "../game.js";

export const KEYS = {
  game: "catan-dice:game",
  silent: "catan-dice:silent",
  names: "catan-dice:names",
};

function get(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: the game still works without persistence
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadGame() {
  const text = get(KEYS.game);
  return text === null ? null : deserialize(text);
}

export const saveGame = (game) => set(KEYS.game, serialize(game));
export const clearGame = () => remove(KEYS.game);

export const loadSilent = () => get(KEYS.silent) === "1";
export const saveSilent = (silent) => set(KEYS.silent, silent ? "1" : "0");

/** Returns a valid-looking array of saved names, or null. */
export function loadNames() {
  const text = get(KEYS.names);
  if (text === null) return null;
  try {
    const names = JSON.parse(text);
    const ok =
      Array.isArray(names) &&
      names.length >= MIN_PLAYERS &&
      names.length <= MAX_PLAYERS &&
      names.every((n) => typeof n === "string");
    return ok ? names : null;
  } catch {
    return null;
  }
}

export const saveNames = (names) => set(KEYS.names, JSON.stringify(names));
