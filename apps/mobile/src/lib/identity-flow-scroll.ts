import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

let nextRegistrationId = 0;
let activeRegistrationId = 0;
let activeScrollViewRef: RefObject<ScrollView | null> | null = null;

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
  activeScrollViewRef?.current?.scrollTo({ animated: false, y: 0 });
}
