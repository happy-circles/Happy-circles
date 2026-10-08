import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { identityModalCoordinator } from './identity-modal-coordination';
import { scheduleAfterVisualFrame } from './visual-transition';

export function useFeedbackModalCoordination(mounted: boolean) {
  const suspended = useSyncExternalStore(
    identityModalCoordinator.subscribe,
    identityModalCoordinator.isSuspended,
    identityModalCoordinator.isSuspended,
  );
  const [registration] = useState(() => identityModalCoordinator.registerFeedbackModal());
  const nativeVisible = mounted && !suspended;
  const nativeVisibleRef = useRef(nativeVisible);
  nativeVisibleRef.current = nativeVisible;
  const onShow = useCallback(() => {
    if (nativeVisibleRef.current) registration.presented();
  }, [registration]);

  useLayoutEffect(() => () => registration.unregister(), [registration]);
  useLayoutEffect(() => {
    if (nativeVisible) {
      registration.presented();
      return;
    }
    // React Native only provides onDismiss on iOS. Elsewhere acknowledge the committed hide.
    if (Platform.OS !== 'ios') return scheduleAfterVisualFrame(registration.dismissed);
  }, [nativeVisible, registration]);

  return {
    suspended,
    nativeVisible,
    onShow,
    onDismiss: registration.dismissed,
  };
}
