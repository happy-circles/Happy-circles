import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

let nextRegistrationId = 0;
let activeRegistrationId = 0;
let activeScrollViewRef: RefObject<ScrollView | null> | null = null;
const IDENTITY_FLOW_SCROLL_SETTLE_FRAMES = 2;

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function registerIdentityFlowScrollView(scrollViewRef: RefObject<ScrollView | null>) {
  const registrationId = ++nextRegistrationId;

  activeRegistrationId = registrationId;
  activeScrollViewRef = scrollViewRef;

  return () => {
    if (activeRegistrationId !== registrationId) {
      return;
    }

    activeRegistrationId = 0;
    activeScrollViewRef = null;
  };
}

export function resetIdentityFlowScrollPosition() {
  const scrollView = activeScrollViewRef?.current;
  if (!scrollView) {
    return false;
  }

  scrollView.scrollTo({ animated: false, y: 0 });
  return true;
}

export async function resetIdentityFlowScrollPositionForHandoff() {
  const didRequestScroll = resetIdentityFlowScrollPosition();
  if (!didRequestScroll) {
    return;
  }

  for (let frame = 0; frame < IDENTITY_FLOW_SCROLL_SETTLE_FRAMES; frame += 1) {
    await waitForNextFrame();
  }
}
