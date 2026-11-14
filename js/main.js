// UI wiring: screens, rendering, animation timing, persistence.
import { rollPair } from "./dice.js";
import {
  validateNames, createGame, moveItem, applyRoll, rerollLast, undoLast, shiftTurn,
  MIN_PLAYERS, MAX_PLAYERS,
} from "./game.js";
import { evaluateEvents } from "./events.js";
import { createSound } from "./sound.js";
import { createHaptics } from "./haptics.js";
import { createShakeDetector, shouldRollOnShake, motionSupport, requestMotionPermission } from "./shake.js";
import {
  TIMER_DEFAULTS, createTimer, stopTimer, pauseTimer, resumeTimer, tickTimer, resetForTurn,
  remainingMs, timerPhase, formatRemaining, nagText,
} from "./timer.js";
import * as store from "./ui/storage.js";
import { nextPlayerIndex } from "./ui/turn.js";
import { drawFace, randomFace } from "./ui/dice-view.js";

const TUMBLE_MS = 1000;
const FLICKER_MS = 70;
const BANNER_MS = 1800;
const TIMER_TICK_MS = 250;
const DEFAULT_ROWS = 4;

const $ = (id) => document.getElementById(id);
const el = {
  setup: $("setup-screen"), game: $("game-screen"),
  names: $("names"), error: $("setup-error"), add: $("add-player"), form: $("setup-form"),
  turn: $("turn"), nextUp: $("next-up"), dice: [$("die-0"), $("die-1")], diceBox: $("dice"), sum: $("sum"),
  rolled: $("rolled"), comment: $("comment"), banner: $("banner"), flash: $("flash"),
  roll: $("roll"), reroll: $("reroll"), undo: $("undo"), prev: $("prev"), next: $("next"),
  newGame: $("new-game"), silent: $("silent"), shake: $("shake"),
  timer: $("timer"), timerToggle: $("timer-toggle"),
  hint: $("settings-hint"), hapticLabel: $("haptic-label"),
};

const sample = { x: 0, y: 0, z: 0, t: 0 };
const sound = createSound({ isSilent: store.loadSilent() });

// iOS 18+ experiment: clicking a hidden switch's label gives a system haptic. Only tried for
// rolls started by a tap/key (not shake), read when the dice land.
let rollFromGesture = false;
const haptics = createHaptics({
  enabled: true,
  switchTick: () => {
    if (!rollFromGesture) return;
    const prev = document.activeElement;
    el.hapticLabel.click();
    if (document.activeElement === el.hapticLabel.querySelector("input")) document.activeElement.blur();
    if (prev && prev !== document.body && typeof prev.focus === "function") prev.focus({ preventScroll: true });
  },
});
const motionEnv = () => ({
  DeviceMotionEvent: globalThis.DeviceMotionEvent,
  isSecureContext: globalThis.isSecureContext,
});
const shakeDetector = createShakeDetector();
let shakeOn = false;
let shakeListening = false;
let shakeRequesting = false; // a permission request is in flight
let shakePending = false; // saved on, but iOS needs a gesture to re-request permission
let hintTimer = 0;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let game = null;
let names = store.loadNames() ?? Array(DEFAULT_ROWS).fill("");
let animating = false;
let bannerTimer = 0;
let timer = createTimer();
let timerOn = store.loadTimer();
let timerInterval = 0;

/* ---------- screens ---------- */

function showScreen(name) {
  el.setup.hidden = name !== "setup";
  el.game.hidden = name !== "game";
}

function showSetup() {
  game = null;
  el.error.textContent = "";
  renderNames();
  showScreen("setup");
}

function showGame() {
  showScreen("game");
  renderStatic();
}

/* ---------- setup screen ---------- */

function renderNames(focus) {
  el.names.replaceChildren(...names.map(createNameRow));
  el.add.disabled = names.length >= MAX_PLAYERS;
  if (focus) el.names.querySelector(focus)?.focus();
}

function createButton(label, aria, onClick, disabled, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `btn btn--icon ${cls}`;
  b.textContent = label;
  b.setAttribute("aria-label", aria);
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

function createNameRow(name, i) {
  const li = document.createElement("li");
  li.className = "name-row";
  const input = document.createElement("input");
  input.className = "input";
  input.type = "text";
  input.value = name;
  input.placeholder = `Player ${i + 1}`;
  input.maxLength = 40;
  input.autocomplete = "off";
  input.setAttribute("aria-label", `Player ${i + 1} name`);
  input.addEventListener("input", () => { names[i] = input.value; });
  const last = names.length - 1;
  li.append(
    input,
    createButton("▲", `Move player ${i + 1} up`, () => move(i, -1), i === 0, "btn--alt up"),
    createButton("▼", `Move player ${i + 1} down`, () => move(i, 1), i === last, "btn--alt down"),
    createButton("✕", `Remove player ${i + 1}`, () => removePlayer(i), names.length <= MIN_PLAYERS, "btn--danger rm"),
  );
  return li;
}

function move(i, dir) {
  names = moveItem(names, i, dir);
  const j = i + dir;
  const atEdge = dir === -1 ? j === 0 : j === names.length - 1;
  const cls = dir === -1 ? "up" : "down";
  const other = dir === -1 ? "down" : "up";
  // Keep focus on the moved row's button; fall back to its sibling if now disabled.
  renderNames(`li:nth-child(${j + 1}) .${atEdge ? other : cls}`);
}

function removePlayer(i) {
  names.splice(i, 1);
  renderNames(`li:nth-child(${Math.min(i, names.length - 1) + 1}) input`);
}

function addPlayer() {
  if (names.length >= MAX_PLAYERS) return;
  names.push("");
  renderNames(`li:nth-child(${names.length}) input`);
}

function startGame(event) {
  event.preventDefault();
  const result = validateNames(names);
  el.error.textContent = result.ok ? "" : result.error;
  if (!result.ok) return;
  game = createGame(names);
  names = game.players.slice();
  store.saveNames(names);
  store.saveGame(game);
  // Reload so the page keeps no typing undo history (iOS Shake to Undo); restore path shows the game.
  if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
  location.reload();
}

/* ---------- game screen rendering ---------- */

function setDice(values) {
  values.forEach((v, i) => drawFace(el.dice[i], v));
}

function renderTurn() {
  const text = `${game.players[game.turn]}'s turn`;
  const hadTurn = el.turn.textContent !== "";
  if (el.turn.textContent !== text) {
    el.turn.textContent = text;
    if (!reducedMotion.matches && hadTurn) restart(el.turn, "turn--change");
  }
  el.nextUp.textContent = `Next: ${game.players[nextPlayerIndex(game.turn, game.players.length)]}`;
}

function renderLastRoll() {
  const last = game.rolls.at(-1);
  if (!last) {
    setDice([1, 1]);
    el.sum.textContent = "";
    el.sum.classList.remove("sum--seven");
    el.rolled.textContent = "Press ROLL!";
    return;
  }
  setDice(last.dice);
  el.sum.textContent = String(last.sum);
  el.sum.classList.toggle("sum--seven", last.sum === 7);
  el.rolled.textContent = `${game.players[last.player]} rolled ${last.sum}`;
}

function renderButtons() {
  const none = game.rolls.length === 0;
  el.roll.disabled = animating;
  el.reroll.disabled = animating || none;
  el.undo.disabled = animating || none;
  el.prev.disabled = el.next.disabled = el.newGame.disabled = animating;
}

function renderSilent() {
  const on = !sound.isSilent();
  el.silent.setAttribute("aria-pressed", String(on));
  el.silent.textContent = on ? "🔊" : "🔇";
}

function renderToggles() {
  renderSilent();
  el.shake.setAttribute("aria-pressed", String(shakeOn));
  el.timerToggle.setAttribute("aria-pressed", String(timerOn));
}

/* ---------- turn timer (all decisions live in timer.js) ---------- */

function renderTimer() {
  const now = performance.now();
  const phase = timerPhase(timer, now);
  el.timer.textContent = phase === "idle" ? "" : formatRemaining(remainingMs(timer, now));
  el.timer.classList.toggle("timer--idle", phase === "idle");
  el.timer.classList.toggle("timer--warning", phase === "warning");
  el.timer.classList.toggle("timer--expired", phase === "expired");
}

function nag() {
  showBanner({ text: nagText(game.players[game.turn]) }, false);
  sound.playShout(); // no-op when silent
  haptics.shout();
}

function tick() {
  const result = tickTimer(timer, performance.now());
  timer = result.state;
  renderTimer();
  if (result.nag && game) nag();
  syncTimer();
}

/** One interval, alive only while the timer is running and has not nagged yet. */
function syncTimer() {
  const need = timer.status === "running" && !timer.nagged;
  if (need && !timerInterval) timerInterval = setInterval(tick, TIMER_TICK_MS);
  else if (!need && timerInterval) { clearInterval(timerInterval); timerInterval = 0; }
}

function stopTurnTimer() {
  timer = stopTimer(timer);
  syncTimer();
  renderTimer();
}

/** The single reset rule. Stays stopped while the dice tumble (reveal resets it). */
function resetTurnTimer() {
  if (animating || !game) { stopTurnTimer(); return; }
  const now = performance.now();
  timer = resetForTurn(timer, { durationMs: timerOn ? TIMER_DEFAULTS.durationMs : 0, rollCount: game.rolls.length }, now);
  if (document.visibilityState === "hidden") timer = pauseTimer(timer, now);
  syncTimer();
  renderTimer();
}

function pauseTurnTimer() {
  timer = pauseTimer(timer, performance.now());
  syncTimer();
}

function resumeTurnTimer() {
  timer = resumeTimer(timer, performance.now());
  syncTimer();
  renderTimer();
}

function showHint(text, sticky = false) {
  clearTimeout(hintTimer);
  el.hint.textContent = text;
  if (text && !sticky) hintTimer = setTimeout(() => { el.hint.textContent = ""; }, 4000);
}

/** Full, animation-free render (start, reload, undo, shift). */
function renderStatic() {
  clearEffects();
  el.comment.textContent = "";
  renderTurn();
  renderLastRoll();
  renderButtons();
  renderToggles();
}

/* ---------- effects ---------- */

function restart(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth; // reflow so the CSS animation restarts
  node.classList.add(cls);
}

function clearEffects() {
  clearTimeout(bannerTimer);
  el.banner.className = "banner";
  el.banner.textContent = "";
  el.flash.className = "flash";
  document.body.classList.remove("shake");
}

function showBanner(event, big) {
  el.banner.textContent = event.text;
  el.banner.className = "banner";
  restart(el.banner, big ? "banner--big" : "banner--shout");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.banner.className = "banner"; }, BANNER_MS + 100);
}

function showEffects({ main, secondary, effect }) {
  const lines = [];
  if (effect === "big" || effect === "shout") {
    showBanner(main, effect === "big");
    if (secondary) lines.push(secondary.text);
    if (effect === "big" && !reducedMotion.matches) {
      restart(el.flash, "flash--on");
      restart(document.body, "shake");
    }
  } else if (effect === "comment") {
    lines.push(main.text);
    if (secondary) lines.push(secondary.text);
  }
  el.comment.textContent = lines.join(" · ");
}

function reveal(events) {
  el.diceBox.classList.remove("tumbling");
  renderLastRoll();
  renderTurn();
  if (reducedMotion.matches) {
    restart(el.diceBox, "fade");
  } else {
    el.dice.forEach((d) => restart(d, "land"));
    restart(el.sum, "pop");
  }
  showEffects(events);
  haptics.land(events.effect);
  animating = false;
  renderButtons();
  resetTurnTimer();
}

/* ---------- actions ---------- */

function rollWith(apply, viaShake = false) {
  if (animating || !game) return;
  const dice = rollPair();
  game = apply(game, dice);
  store.saveGame(game);
  const events = evaluateEvents(game);
  animating = true;
  stopTurnTimer();
  clearEffects();
  el.comment.textContent = "";
  renderButtons();
  sound.playRattle();
  rollFromGesture = !viaShake;
  if (reducedMotion.matches) {
    reveal(events);
    playOutcome(events);
    return;
  }
  el.sum.textContent = "";
  el.rolled.textContent = "Rolling...";
  el.diceBox.classList.add("tumbling");
  const flicker = setInterval(() => setDice([randomFace(), randomFace()]), FLICKER_MS);
  setTimeout(() => {
    clearInterval(flicker);
    reveal(events);
    playOutcome(events);
  }, TUMBLE_MS);
}

function playOutcome({ effect }) {
  if (effect === "big") { sound.playBig(); }
  else if (effect === "shout") { sound.playShout(); }
}

const roll = (viaShake = false) => rollWith((g, d) => applyRoll(g, d), viaShake === true);
const reroll = () => { if (game?.rolls.length) rollWith((g, d) => rerollLast(g, d)); };

function updateGame(next) {
  if (animating) return;
  game = next;
  store.saveGame(game);
  renderStatic();
  resetTurnTimer();
}

function newGame() {
  if (animating || !confirm("Start a new game? The current game will be lost.")) return;
  names = game.players.slice();
  store.clearGame();
  stopTurnTimer();
  clearEffects();
  showSetup();
}

function toggleSilent() {
  showHint("");
  sound.setSilent(!sound.isSilent());
  store.saveSilent(sound.isSilent());
  if (!sound.isSilent()) sound.unlock();
  renderSilent();
}

function toggleTimer() {
  timerOn = !timerOn;
  store.saveTimer(timerOn);
  resetTurnTimer();
  renderToggles();
}

/* ---------- shake ---------- */

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  sample.x = a.x; sample.y = a.y; sample.z = a.z; sample.t = performance.now();
  const hit = shakeDetector.push(sample);
  if (hit && shouldRollOnShake({ enabled: shakeOn, screen: el.game.hidden ? "setup" : "game", animating })) {
    roll(true);
  }
}

function listenMotion(on) {
  if (on === shakeListening) return;
  shakeListening = on;
  shakeDetector.reset();
  if (on) window.addEventListener("devicemotion", onMotion);
  else window.removeEventListener("devicemotion", onMotion);
}

function setShake(on) {
  shakeOn = on;
  shakePending = false;
  store.saveShake(on);
  listenMotion(on);
  renderToggles();
}

let shakeToken = 0;
const DENIED_HINT = "Motion access denied. Re-enable it in Safari settings.";

function toggleShake() {
  if (el.shake.getAttribute("aria-disabled") === "true") {
    showHint(el.shake.title);
    return;
  }
  if (shakeOn) { // on or pending: turning off always works; late results are discarded
    shakeToken++;
    shakeRequesting = false;
    setShake(false);
    showHint("");
    return;
  }
  if (shakeRequesting) return;
  shakeRequesting = true;
  const token = ++shakeToken;
  const request = requestMotionPermission(motionEnv()); // must start inside the tap
  if (!sound.isSilent()) sound.unlock();
  request.then((result) => {
    if (token !== shakeToken) return;
    shakeRequesting = false;
    if (result === "granted") { setShake(true); showHint(""); }
    else {
      setShake(false);
      showHint(result === "denied" ? DENIED_HINT : "Couldn't request motion access \u2014 tap again.");
    }
  });
}

function initShake() {
  const support = motionSupport(motionEnv());
  if (support !== "ok") {
    el.shake.setAttribute("aria-disabled", "true");
    el.shake.title = support === "insecure"
      ? "Shake to roll needs HTTPS"
      : "Shake to roll needs a motion sensor";
    return;
  }
  el.shake.title = "Shake to roll";
  if (!store.loadShake()) return;
  shakeOn = true;
  if (typeof globalThis.DeviceMotionEvent.requestPermission !== "function") {
    listenMotion(true);
    return;
  }
  // iOS: permission can only be requested from a user gesture.
  shakePending = true;
  const types = ["touchend", "click", "keydown"];
  const detach = () => types.forEach((t) => document.removeEventListener(t, onGesture, true));
  const onGesture = (e) => {
    if (e.target && typeof e.target.closest === "function" && e.target.closest("#shake")) return;
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    if (!shakePending || shakeRequesting) { if (!shakePending) detach(); return; }
    detach();
    shakeRequesting = true;
    const token = ++shakeToken;
    requestMotionPermission(motionEnv()).then((result) => {
      if (token !== shakeToken) return;
      shakeRequesting = false;
      if (!shakeOn || !shakePending) return;
      if (result === "granted") { shakePending = false; listenMotion(true); }
      else if (result === "denied") { setShake(false); showHint(DENIED_HINT); }
      else types.forEach((t) => document.addEventListener(t, onGesture, true)); // not a real deny: retry on next gesture
    });
  };
  types.forEach((t) => document.addEventListener(t, onGesture, true));
}

/* ---------- audio unlock ---------- */

const GESTURES = ["pointerup", "touchend", "click", "keydown"];
function onFirstGesture() {
  // Listeners stay attached: iOS can re-suspend the context after backgrounding.
  if (sound.needsUnlock()) sound.unlock();
}

function onKey(event) {
  if (el.game.hidden || animating || event.repeat) return;
  if (event.key !== " " && event.key !== "Enter") return;
  if (event.target.closest("button, input, select, textarea, a")) return;
  event.preventDefault();
  roll();
}

/* ---------- init ---------- */

el.add.addEventListener("click", addPlayer);
el.form.addEventListener("submit", startGame);
el.roll.addEventListener("click", () => roll());
el.reroll.addEventListener("click", reroll);
el.undo.addEventListener("click", () => updateGame(undoLast(game)));
el.prev.addEventListener("click", () => updateGame(shiftTurn(game, -1)));
el.next.addEventListener("click", () => updateGame(shiftTurn(game, 1)));
el.newGame.addEventListener("click", newGame);
el.silent.addEventListener("click", toggleSilent);
el.shake.addEventListener("click", toggleShake);
el.timerToggle.addEventListener("click", toggleTimer);
GESTURES.forEach((t) => document.addEventListener(t, onFirstGesture, true));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { sound.resumeIfNeeded(); resumeTurnTimer(); }
  else if (document.visibilityState === "hidden") { sound.markStale(); pauseTurnTimer(); }
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted && document.visibilityState === "visible") { sound.resumeIfNeeded(); resumeTurnTimer(); }
});
window.addEventListener("pagehide", () => { sound.markStale(); pauseTurnTimer(); });
initShake();
document.addEventListener("keydown", onKey);

game = store.loadGame();
if (game) { showGame(); resetTurnTimer(); }
else showSetup();
