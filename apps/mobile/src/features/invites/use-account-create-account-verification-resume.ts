import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { Router } from 'expo-router';
import { AppState } from 'react-native';

import { returnToRoute } from '@/lib/navigation';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { beginSetupEntryHandoff } from '@/lib/setup-entry-handoff';
import { runSingleFlight } from '@/lib/single-flight';
import {
  clearPendingAccountVerificationIfMatches,
  pendingVerificationMatchesSessionEmail,
  readPendingAccountVerification,
} from '@/lib/account-verification';
import type { SessionContextValue } from '@/providers/session-provider';
import { emailOtpResendSecondsRemaining } from './account-create-account-verification';

interface VerificationResumeInput {
  readonly pendingVerificationCreatedAt: string | null;
  readonly pendingVerificationEmail: string | null;
  readonly resendAvailableAt: number;
  readonly router: Router;
  readonly session: SessionContextValue;
  readonly setEmail: Dispatch<SetStateAction<string>>;
  readonly setPendingVerificationEmail: Dispatch<SetStateAction<string | null>>;
  readonly setPendingVerificationCreatedAt: Dispatch<SetStateAction<string | null>>;
  readonly setResendAvailableAt: Dispatch<SetStateAction<number>>;
  readonly setVerificationCode: Dispatch<SetStateAction<string>>;
  readonly setupNavigationStartedRef: MutableRefObject<boolean>;
  readonly token: string;
}

export function useAccountCreateAccountVerificationResume(input: VerificationResumeInput) {
  const [verificationHydrated, setVerificationHydrated] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const sessionRefreshFlightRef = useRef<Promise<void> | null>(null);
  const navigationFlightRef = useRef<Promise<void> | null>(null);
  const lastSessionProbeKeyRef = useRef<string | null>(null);

  const refreshVerificationSession = useCallback(
    () =>
      runSingleFlight(sessionRefreshFlightRef, () =>
        input.session.refreshAccountState({
          preserveLocked: true,
          preserveTrustedDeviceDuringLoad: true,
        }),
      ),
    [input.session.refreshAccountState],
  );

  useEffect(() => {
    let cancelled = false;
    setVerificationHydrated(false);
    input.setPendingVerificationCreatedAt(null);
    input.setPendingVerificationEmail(null);
    input.setVerificationCode('');

    void readPendingAccountVerification(input.token)
      .then((pending) => {
        if (!cancelled && pending) {
          input.setEmail(pending.email);
          input.setPendingVerificationCreatedAt(pending.createdAt);
          input.setPendingVerificationEmail(pending.email);
          input.setResendAvailableAt(pending.resendAvailableAt);
          setResendCooldownSeconds(emailOtpResendSecondsRemaining(pending.resendAvailableAt));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVerificationHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    input.setEmail,
    input.setPendingVerificationEmail,
    input.setPendingVerificationCreatedAt,
    input.setResendAvailableAt,
    input.setVerificationCode,
    input.token,
  ]);

  useEffect(() => {
    if (!input.pendingVerificationEmail) {
      setResendCooldownSeconds(0);
      return undefined;
    }

    const updateCooldown = () =>
      setResendCooldownSeconds(emailOtpResendSecondsRemaining(input.resendAvailableAt));
    updateCooldown();
    const interval = setInterval(updateCooldown, 1_000);
    return () => clearInterval(interval);
  }, [input.pendingVerificationEmail, input.resendAvailableAt]);

  useFocusEffect(
    useCallback(() => {
      if (input.pendingVerificationEmail && input.session.status !== 'loading') {
        void refreshVerificationSession().catch(() => undefined);
      }
      return undefined;
    }, [input.pendingVerificationEmail, input.session.status, refreshVerificationSession]),
  );

  useEffect(() => {
    if (!input.pendingVerificationEmail) {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshVerificationSession().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [input.pendingVerificationEmail, refreshVerificationSession]);

  useEffect(() => {
    if (!input.pendingVerificationEmail || input.session.status === 'loading') {
      return;
    }

    const probeKey = [
      input.session.status,
      input.session.userId,
      input.session.email,
      input.session.isEmailConfirmed,
    ].join(':');
    if (lastSessionProbeKeyRef.current !== probeKey) {
      lastSessionProbeKeyRef.current = probeKey;
      void refreshVerificationSession().catch(() => undefined);
    }
  }, [
    input.pendingVerificationEmail,
    input.session.isEmailConfirmed,
    input.session.email,
    input.session.status,
    input.session.userId,
    refreshVerificationSession,
  ]);

  useEffect(() => {
    const session = input.session;
    if (
      !input.pendingVerificationEmail ||
      !pendingVerificationMatchesSessionEmail({
        pendingEmail: input.pendingVerificationEmail,
        sessionEmail: session.email,
      }) ||
      !session.isEmailConfirmed ||
      session.status === 'loading' ||
      session.status === 'signed_out' ||
      session.accountAccessState === 'loading' ||
      session.profileCompletionState === 'loading'
    ) {
      return;
    }

    void runSingleFlight(navigationFlightRef, async () => {
      if (input.setupNavigationStartedRef.current) {
        return;
      }

      const setupStep = !session.setupState.requiredComplete
        ? (session.setupState.pendingRequiredSteps[0] ?? 'profile')
        : session.setupState.securityPending
          ? 'security'
          : null;
      input.setupNavigationStartedRef.current = true;
      try {
        if (setupStep) {
          await beginSetupEntryHandoff();
        }
        if (input.pendingVerificationCreatedAt) {
          await clearPendingAccountVerificationIfMatches({
            createdAt: input.pendingVerificationCreatedAt,
            email: input.pendingVerificationEmail,
            token: input.token,
          }).catch(() => undefined);
        }
        returnToRoute(
          input.router,
          setupStep
            ? buildSetupAccountHref(setupStep)
            : session.accountAccessState === 'active'
              ? '/home'
              : { pathname: '/join/[token]', params: { token: input.token } },
        );
      } catch (error) {
        input.setupNavigationStartedRef.current = false;
        throw error;
      }
    });
  }, [
    input.pendingVerificationEmail,
    input.pendingVerificationCreatedAt,
    input.router,
    input.session,
    input.setupNavigationStartedRef,
    input.token,
  ]);

  return { refreshVerificationSession, resendCooldownSeconds, verificationHydrated };
}
