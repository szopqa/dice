// UI wiring — reads the form, rolls, renders the result.
import { rollDice, sum } from "./dice.js";

const form = document.getElementById("roll-form");
const diceList = document.getElementById("dice");
const totalEl = document.getElementById("total");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const count = Number(data.get("count"));
  const sides = Number(data.get("sides"));

  render(rollDice(count, sides));
});

function render(values) {
  diceList.replaceChildren(...values.map(createDie));

  totalEl.hidden = values.length < 2;
  totalEl.innerHTML = `Total: <strong>${sum(values)}</strong>`;
}

function createDie(value) {
  const li = document.createElement("li");
  li.className = "die";
  li.textContent = value;
  return li;
}
