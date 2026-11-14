// Shake detection and motion permission helpers (pure; no DOM access).
const GRAVITY = 9.81;

export function createShakeDetector({
  threshold = 15,
  peaks = 3,
  windowMs = 800,
  cooldownMs = 1500,
} = {}) {
  let prevDelta = 0;
  let lastT = -Infinity;
  let peakTimes = [];
  let cooldownUntil = -Infinity;

  return {
    push(sample) {
      if (!sample || typeof sample !== "object") return false;
      const { x, y, z, t } = sample;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(t)) {
        return false;
      }
      if (t < lastT) return false;
      lastT = t;

      const delta = Math.abs(Math.sqrt(x * x + y * y + z * z) - GRAVITY);
      const isPeak = delta >= threshold && prevDelta < threshold;
      prevDelta = delta;

      if (t < cooldownUntil) return false;
      if (!isPeak) return false;

      peakTimes.push(t);
      peakTimes = peakTimes.filter((pt) => t - pt <= windowMs);
      if (peakTimes.length >= peaks) {
        peakTimes = [];
        cooldownUntil = t + cooldownMs;
        return true;
      }
      return false;
    },
    reset() {
      prevDelta = 0;
      lastT = -Infinity;
      peakTimes = [];
      cooldownUntil = -Infinity;
    },
  };
}

export const shouldRollOnShake = ({ enabled, screen, animating } = {}) =>
  enabled === true && screen === "game" && animating === false;

export function motionSupport({ DeviceMotionEvent, isSecureContext } = {}) {
  if (DeviceMotionEvent === undefined) return "unsupported";
  if (!isSecureContext) return "insecure";
  return "ok";
}

export function requestMotionPermission(env = {}) {
  const support = motionSupport(env);
  if (support !== "ok") return Promise.resolve(support);
  const { DeviceMotionEvent } = env;
  if (typeof DeviceMotionEvent.requestPermission !== "function") {
    return Promise.resolve("granted");
  }
  let result;
  try {
    result = DeviceMotionEvent.requestPermission();
  } catch {
    return Promise.resolve("error");
  }
  // "denied" = explicit user denial; "error" = request rejected (e.g. NotAllowedError, no gesture).
  return Promise.resolve(result).then(
    (r) => (r === "granted" ? "granted" : "denied"),
    () => "error",
  );
}
