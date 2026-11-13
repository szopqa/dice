// Pure helper: index of the player who plays after the current one.
export function nextPlayerIndex(turn, count) {
  return (turn + 1) % count;
}
