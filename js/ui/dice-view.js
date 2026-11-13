// Draws a die face with CSS pips. Pure DOM helpers, no game logic.

// Pip positions on a 3x3 grid, numbered 1..9 row by row.
const PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export function drawFace(dieEl, value) {
  const pips = PIPS[value].map((cell) => {
    const pip = document.createElement("span");
    pip.className = "pip";
    pip.style.gridRow = String(Math.ceil(cell / 3));
    pip.style.gridColumn = String(((cell - 1) % 3) + 1);
    return pip;
  });
  dieEl.replaceChildren(...pips);
  dieEl.dataset.face = String(value);
  dieEl.setAttribute("aria-label", `Die showing ${value}`);
}

export const randomFace = () => 1 + Math.floor(Math.random() * 6);
