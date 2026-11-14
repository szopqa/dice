// localStorage wrapper: every access is guarded (private mode, quota, corrupt data).
import { TIMER_STEPS } from "../timer.js";
import { deserialize, serialize, MIN_PLAYERS, MAX_PLAYERS } from "../game.js";

export const KEYS = {
  game: "catan-dice:game",
  silent: "catan-dice:silent",
  names: "catan-dice:names",
  shake: "catan-dice:shake",
  timer: "catan-dice:timer",
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

export const loadShake = () => get(KEYS.shake) === "1";
export const saveShake = (v) => set(KEYS.shake, v ? "1" : "0");

/** Stored as whole seconds; legacy "1" (old boolean on) means 60 s. Returns ms, or 0 for off/invalid/unlisted. */
export function loadTimer(steps = TIMER_STEPS) {
  const text = get(KEYS.timer);
  if (text === null || !/^\d+$/.test(text)) return 0;
  const seconds = text === "1" ? 60 : Number(text);
  const ms = seconds * 1000;
  return steps.includes(ms) ? ms : 0;
}

export function saveTimer(ms) {
  const ok = typeof ms === "number" && Number.isFinite(ms) && ms > 0;
  set(KEYS.timer, ok ? String(Math.round(ms / 1000)) : "0");
}

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
