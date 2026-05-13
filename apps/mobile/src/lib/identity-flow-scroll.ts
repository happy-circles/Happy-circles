import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

import { requestLaunchTargetRemeasure } from '@/lib/launch-target-remeasure';

let nextRegistrationId = 0;
let activeRegistrationId = 0;
let activeScrollViewRef: RefObject<ScrollView | null> | null = null;
let activeScrollY = 0;
let activeViewportHeight = 0;
const activeTargets = new Map<string, IdentityFlowScrollTargetSnapshot>();
let nextKeyboardResetRegistrationId = 0;
let activeKeyboardResetRegistrationId = 0;
let activeKeyboardResetForHandoff: (() => Promise<void> | void) | null = null;
const IDENTITY_FLOW_SCROLL_SETTLE_FRAMES = 5;
const IDENTITY_FLOW_SCROLL_ANIMATED_SETTLE_FRAMES = 18;
const IDENTITY_FLOW_TARGET_REMEASURE_FRAMES = 8;
const IDENTITY_FLOW_CENTER_THRESHOLD = 1.25;

export type IdentityFlowTransitionScrollPolicy = 'preserve' | 'reset-top' | 'reveal-end';

export interface IdentityFlowScrollTargetSnapshot {
  readonly height: number;
  readonly id: string;
  readonly priority: number;
  readonly stableAt: number;
  readonly updatedAt: number;
  readonly visualKind: 'headerBrand' | 'identityAvatar' | 'identityMark';
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface IdentityFlowCenteredScrollInput {
  readonly currentScrollY: number;
  readonly targetHeight: number;
  readonly targetY: number;
  readonly viewportHeight: number;
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForFrames(frameCount: number) {
  for (let frame = 0; frame < frameCount; frame += 1) {
    await waitForNextFrame();
  }
}

function isIdentityTarget(target: IdentityFlowScrollTargetSnapshot) {
  return target.visualKind === 'identityAvatar' || target.visualKind === 'identityMark';
}

function activeIdentityTarget() {
  const identityTargets = [...activeTargets.values()].filter(
    (target) => isIdentityTarget(target) && target.width > 0 && target.height > 0,
  );

  identityTargets.sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    return right.updatedAt - left.updatedAt;
  });

  return identityTargets[0] ?? null;
}

export function resolveCenteredIdentityFlowScrollY({
  currentScrollY,
  targetHeight,
  targetY,
  viewportHeight,
}: IdentityFlowCenteredScrollInput) {
  if (viewportHeight <= 0 || targetHeight <= 0) {
    return Math.max(0, currentScrollY);
  }

  const targetCenterY = targetY + targetHeight / 2;
  const viewportCenterY = viewportHeight / 2;
  return Math.max(0, currentScrollY + targetCenterY - viewportCenterY);
}

export function registerIdentityFlowScrollView(
  scrollViewRef: RefObject<ScrollView | null>,
  options?: { readonly viewportHeight?: number },
) {
  const registrationId = ++nextRegistrationId;

  activeRegistrationId = registrationId;
  activeScrollViewRef = scrollViewRef;
  activeViewportHeight = Math.max(0, options?.viewportHeight ?? activeViewportHeight);

  return () => {
    if (activeRegistrationId !== registrationId) {
      return;
    }

    activeRegistrationId = 0;
    activeScrollViewRef = null;
    activeScrollY = 0;
    activeViewportHeight = 0;
  };
}

export function registerIdentityFlowKeyboardResetForHandoff(
  resetKeyboardForHandoff: () => Promise<void> | void,
) {
  const registrationId = ++nextKeyboardResetRegistrationId;

  activeKeyboardResetRegistrationId = registrationId;
  activeKeyboardResetForHandoff = resetKeyboardForHandoff;

  return () => {
    if (activeKeyboardResetRegistrationId !== registrationId) {
      return;
    }

    activeKeyboardResetRegistrationId = 0;
    activeKeyboardResetForHandoff = null;
  };
}

export function updateIdentityFlowScrollMetrics(input: {
  readonly scrollY?: number;
  readonly viewportHeight?: number;
}) {
  if (input.scrollY !== undefined) {
    activeScrollY = Math.max(0, input.scrollY);
  }

  if (input.viewportHeight !== undefined) {
    activeViewportHeight = Math.max(0, input.viewportHeight);
  }
}

export function upsertIdentityFlowScrollTarget(target: IdentityFlowScrollTargetSnapshot) {
  activeTargets.set(target.id, target);
}

export function clearIdentityFlowScrollTarget(id: string) {
  activeTargets.delete(id);
}

export function scrollIdentityFlowToTop({ animated = false }: { readonly animated?: boolean } = {}) {
  const scrollView = activeScrollViewRef?.current;
  if (!scrollView) {
    return false;
  }

  activeScrollY = 0;
  scrollView.scrollTo({ animated, y: 0 });
  return true;
}

export function centerIdentityFlowTargetForHandoff({
  animated = true,
}: { readonly animated?: boolean } = {}) {
  const scrollView = activeScrollViewRef?.current;
  const target = activeIdentityTarget();
  if (!scrollView || !target || activeViewportHeight <= 0) {
    return false;
  }

  const targetScrollY = resolveCenteredIdentityFlowScrollY({
    currentScrollY: activeScrollY,
    targetHeight: target.height,
    targetY: target.y,
    viewportHeight: activeViewportHeight,
  });

  if (Math.abs(targetScrollY - activeScrollY) <= IDENTITY_FLOW_CENTER_THRESHOLD) {
    return true;
  }

  activeScrollY = targetScrollY;
  scrollView.scrollTo({ animated, y: targetScrollY });
  return true;
}

export async function prepareIdentityFlowTargetForHandoff({
  animated = true,
}: { readonly animated?: boolean } = {}) {
  if (activeKeyboardResetForHandoff) {
    await activeKeyboardResetForHandoff();
    requestLaunchTargetRemeasure();
    await waitForFrames(IDENTITY_FLOW_TARGET_REMEASURE_FRAMES);
  }

  const didRequestScroll = centerIdentityFlowTargetForHandoff({ animated });

  if (didRequestScroll) {
    await waitForFrames(
      animated ? IDENTITY_FLOW_SCROLL_ANIMATED_SETTLE_FRAMES : IDENTITY_FLOW_SCROLL_SETTLE_FRAMES,
    );
  }

  requestLaunchTargetRemeasure();
  await waitForFrames(IDENTITY_FLOW_TARGET_REMEASURE_FRAMES);
  centerIdentityFlowTargetForHandoff({ animated: false });
  await waitForFrames(IDENTITY_FLOW_SCROLL_SETTLE_FRAMES);
}

export function resetIdentityFlowScrollPosition() {
  return scrollIdentityFlowToTop({ animated: false });
}

export async function resetIdentityFlowScrollPositionForHandoff() {
  await prepareIdentityFlowTargetForHandoff({ animated: true });
}
