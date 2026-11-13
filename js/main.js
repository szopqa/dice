// UI wiring: screens, rendering, animation timing, persistence.
import { rollPair } from "./dice.js";
import {
  validateNames, createGame, moveItem, applyRoll, rerollLast, undoLast, shiftTurn,
  MIN_PLAYERS, MAX_PLAYERS,
} from "./game.js";
import { evaluateEvents } from "./events.js";
import { createSound } from "./sound.js";
import * as store from "./ui/storage.js";
import { nextPlayerIndex } from "./ui/turn.js";
import { drawFace, randomFace } from "./ui/dice-view.js";

const TUMBLE_MS = 1000;
const FLICKER_MS = 70;
const BANNER_MS = 1800;
const DEFAULT_ROWS = 4;

const $ = (id) => document.getElementById(id);
const el = {
  setup: $("setup-screen"), game: $("game-screen"),
  names: $("names"), error: $("setup-error"), add: $("add-player"), form: $("setup-form"),
  turn: $("turn"), nextUp: $("next-up"), dice: [$("die-0"), $("die-1")], diceBox: $("dice"), sum: $("sum"),
  rolled: $("rolled"), comment: $("comment"), banner: $("banner"), flash: $("flash"),
  roll: $("roll"), reroll: $("reroll"), undo: $("undo"), prev: $("prev"), next: $("next"),
  newGame: $("new-game"), silent: $("silent"),
};

const sound = createSound({ isSilent: store.loadSilent() });
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let game = null;
let names = store.loadNames() ?? Array(DEFAULT_ROWS).fill("");
let animating = false;
let bannerTimer = 0;

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
  showGame();
}

/* ---------- game screen rendering ---------- */

function setDice(values) {
  values.forEach((v, i) => drawFace(el.dice[i], v));
}

function renderTurn() {
  const text = `${game.players[game.turn]}'s turn`;
  if (el.turn.textContent !== text) {
    el.turn.textContent = text;
    if (!reducedMotion.matches) restart(el.turn, "turn--change");
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
  const on = sound.isSilent();
  el.silent.setAttribute("aria-pressed", String(on));
  el.silent.textContent = on ? "🔇 Silent" : "🔊 Sound";
}

/** Full, animation-free render (start, reload, undo, shift). */
function renderStatic() {
  clearEffects();
  el.comment.textContent = "";
  renderTurn();
  renderLastRoll();
  renderButtons();
  renderSilent();
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
  animating = false;
  renderButtons();
}

/* ---------- actions ---------- */

function rollWith(apply) {
  if (animating || !game) return;
  const dice = rollPair();
  game = apply(game, dice);
  store.saveGame(game);
  const events = evaluateEvents(game);
  animating = true;
  clearEffects();
  el.comment.textContent = "";
  renderButtons();
  sound.playRattle();
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
  if (effect === "big") sound.playBig();
  else if (effect === "shout") sound.playShout();
}

const roll = () => rollWith((g, d) => applyRoll(g, d));
const reroll = () => { if (game.rolls.length) rollWith((g, d) => rerollLast(g, d)); };

function updateGame(next) {
  if (animating) return;
  game = next;
  store.saveGame(game);
  renderStatic();
}

function newGame() {
  if (animating || !confirm("Start a new game? The current game will be lost.")) return;
  names = game.players.slice();
  store.clearGame();
  clearEffects();
  showSetup();
}

function toggleSilent() {
  sound.setSilent(!sound.isSilent());
  store.saveSilent(sound.isSilent());
  renderSilent();
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
el.roll.addEventListener("click", roll);
el.reroll.addEventListener("click", reroll);
el.undo.addEventListener("click", () => updateGame(undoLast(game)));
el.prev.addEventListener("click", () => updateGame(shiftTurn(game, -1)));
el.next.addEventListener("click", () => updateGame(shiftTurn(game, 1)));
el.newGame.addEventListener("click", newGame);
el.silent.addEventListener("click", toggleSilent);
document.addEventListener("keydown", onKey);

game = store.loadGame();
if (game) showGame();
else showSetup();
