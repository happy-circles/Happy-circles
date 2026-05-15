import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';

import type { AppTextInputRef } from '@/components/app-text-input';
import { resolveProfileFocusRequest } from './profile-helpers';

export type ProfileHighlightTarget = 'account' | 'methods' | 'device';

interface ProfileFocusControllerOptions {
  readonly canTrustCurrentDeviceWithoutPassword: boolean;
  readonly focusTarget: string | null;
  readonly hasEmailPassword: boolean;
  readonly isTrustedDevice: boolean;
  readonly sectionTarget: string | null;
}

export function useProfileFocusController({
  canTrustCurrentDeviceWithoutPassword,
  focusTarget,
  hasEmailPassword,
  isTrustedDevice,
  sectionTarget,
}: ProfileFocusControllerOptions) {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const accountOffsetRef = useRef(0);
  const methodsOffsetRef = useRef(0);
  const deviceOffsetRef = useRef(0);
  const accountMeasuredRef = useRef(false);
  const methodsMeasuredRef = useRef(false);
  const deviceMeasuredRef = useRef(false);
  const trustPasswordInputRef = useRef<AppTextInputRef | null>(null);
  const attachPasswordInputRef = useRef<AppTextInputRef | null>(null);
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trustPasswordFallbackOpen, setTrustPasswordFallbackOpen] = useState(false);
  const [highlightTarget, setHighlightTarget] = useState<ProfileHighlightTarget | null>(null);

  const clearFocusTimers = useCallback(() => {
    if (pendingScrollTimeoutRef.current) {
      clearTimeout(pendingScrollTimeoutRef.current);
      pendingScrollTimeoutRef.current = null;
    }

    if (delayedFocusTimeoutRef.current) {
      clearTimeout(delayedFocusTimeoutRef.current);
      delayedFocusTimeoutRef.current = null;
    }

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  const queueHighlightReset = useCallback(() => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightTarget(null);
      highlightTimeoutRef.current = null;
    }, 2600);
  }, []);

  const focusProfileSection = useCallback(() => {
    const focusRequest = resolveProfileFocusRequest({
      canTrustCurrentDeviceWithoutPassword,
      focusTarget,
      hasEmailPassword,
      isTrustedDevice,
      sectionTarget,
    });
    if (!focusRequest) {
      return false;
    }

    const scrollTo = (target: ProfileHighlightTarget, offset: number) => {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, offset - 24), animated: true });
      setHighlightTarget(target);
      queueHighlightReset();
    };

    const scrollToMethods = () => scrollTo('methods', methodsOffsetRef.current);
    const scrollToDevice = () => scrollTo('device', deviceOffsetRef.current);

    if (focusRequest.inputTarget === 'attach-password') {
      if (!methodsMeasuredRef.current || !attachPasswordInputRef.current) {
        return false;
      }

      scrollToMethods();
      delayedFocusTimeoutRef.current = setTimeout(() => {
        attachPasswordInputRef.current?.focus();
        delayedFocusTimeoutRef.current = null;
      }, 220);
      return true;
    }

    if (focusRequest.inputTarget === 'trust-password') {
      if (!deviceMeasuredRef.current || !trustPasswordInputRef.current) {
        setTrustPasswordFallbackOpen(true);
        return false;
      }

      setTrustPasswordFallbackOpen(true);
      scrollToDevice();
      delayedFocusTimeoutRef.current = setTimeout(() => {
        trustPasswordInputRef.current?.focus();
        delayedFocusTimeoutRef.current = null;
      }, 220);
      return true;
    }

    if (focusRequest.highlightTarget === 'device') {
      if (!deviceMeasuredRef.current) {
        return false;
      }

      scrollToDevice();
      return true;
    }

    if (focusRequest.highlightTarget === 'account') {
      if (!accountMeasuredRef.current) {
        return false;
      }

      scrollTo('account', accountOffsetRef.current);
      return true;
    }

    if (focusRequest.highlightTarget === 'methods') {
      if (!methodsMeasuredRef.current) {
        return false;
      }

      scrollToMethods();
      return true;
    }

    return false;
  }, [
    canTrustCurrentDeviceWithoutPassword,
    focusTarget,
    hasEmailPassword,
    isTrustedDevice,
    queueHighlightReset,
    sectionTarget,
  ]);

  useEffect(() => {
    if (!focusTarget && !sectionTarget) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const attemptFocus = () => {
      if (cancelled) {
        return;
      }

      if (focusProfileSection()) {
        pendingScrollTimeoutRef.current = null;
        return;
      }

      attempts += 1;
      if (attempts >= 10) {
        pendingScrollTimeoutRef.current = null;
        return;
      }

      pendingScrollTimeoutRef.current = setTimeout(attemptFocus, 120);
    };

    pendingScrollTimeoutRef.current = setTimeout(attemptFocus, 60);

    return () => {
      cancelled = true;
      clearFocusTimers();
    };
  }, [clearFocusTimers, focusProfileSection, focusTarget, sectionTarget]);

  useEffect(() => () => clearFocusTimers(), [clearFocusTimers]);

  return {
    accountMeasuredRef,
    accountOffsetRef,
    attachPasswordInputRef,
    deviceMeasuredRef,
    deviceOffsetRef,
    highlightTarget,
    methodsMeasuredRef,
    methodsOffsetRef,
    scrollViewRef,
    setTrustPasswordFallbackOpen,
    trustPasswordFallbackOpen,
    trustPasswordInputRef,
  };
}
