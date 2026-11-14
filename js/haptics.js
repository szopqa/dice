export const HAPTIC_PATTERNS = {
  tick: 15,
  shout: [40, 60, 40],
  big: [120, 60, 120, 60, 250],
};

export function createHaptics({
  enabled = true,
  navigator = globalThis.navigator,
  switchTick = null,
} = {}) {
  let on = !!enabled;

  function hasVibrate() {
    try {
      return !!navigator && typeof navigator.vibrate === "function";
    } catch {
      return false;
    }
  }

  function vibrate(pattern) {
    if (!on || !hasVibrate()) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }

  return {
    tick() {
      if (!on) return;
      if (hasVibrate()) return vibrate(HAPTIC_PATTERNS.tick);
      if (typeof switchTick === "function") {
        try {
          switchTick();
        } catch {
          // ignore
        }
      }
    },
    land(effect) {
      if (!on) return;
      if (hasVibrate()) {
        return vibrate(
          effect === "big" ? HAPTIC_PATTERNS.big : effect === "shout" ? HAPTIC_PATTERNS.shout : HAPTIC_PATTERNS.tick,
        );
      }
      if (typeof switchTick === "function") {
        try {
          switchTick();
        } catch {
          // ignore
        }
      }
    },
    shout() {
      vibrate(HAPTIC_PATTERNS.shout);
    },
    big() {
      vibrate(HAPTIC_PATTERNS.big);
    },
    setEnabled(v) {
      on = !!v;
    },
    isEnabled() {
      return on;
    },
  };
}
