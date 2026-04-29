let authRouteTransitionHoldUntil = 0;

export function beginAuthRouteTransitionHold(durationMs: number) {
  authRouteTransitionHoldUntil = Date.now() + durationMs;
}

export function clearAuthRouteTransitionHold() {
  authRouteTransitionHoldUntil = 0;
}

export function isAuthRouteTransitionHoldActive() {
  if (Date.now() <= authRouteTransitionHoldUntil) {
    return true;
  }

  authRouteTransitionHoldUntil = 0;
  return false;
}
