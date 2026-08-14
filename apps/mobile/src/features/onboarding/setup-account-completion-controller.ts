import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'expo-router';

import { beginHomeEntryHandoffAfterScrollReset } from '@/lib/home-entry-handoff';
import {
  clearPendingInviteIntentIfMatches,
  readPendingInviteIntent,
  type PendingInviteIntent,
} from '@/lib/invite-intent';
import {
  useActivateAccountFromInviteMutation,
  useResumeAccountInviteMutation,
} from '@/lib/live-data';
import { returnToRoute } from '@/lib/navigation';
import {
  clearPendingNavigationIntentIfMatches,
  readPendingNavigationIntent,
} from '@/lib/pending-navigation-intent';
import { resolveSetupCompletionRouteDecision } from '@/lib/pre-home-routing';
import { runSingleFlight } from '@/lib/single-flight';
import { resolveStableIdempotencyKey, type StableIdempotencyKey } from '@/lib/stable-idempotency';
import {
  triggerIdentitySuccessHaptic as triggerSuccessHaptic,
  triggerIdentityWarningHaptic as triggerWarningHaptic,
} from '@/lib/identity-flow-haptics';
import type { SessionContextValue } from '@/providers/session/types';

export function useSetupAccountCompletionController(input: {
  readonly isSetupPreviewMode: boolean;
  readonly returnToProfile: boolean;
  readonly session: SessionContextValue;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const router = useRouter();
  const activateInvite = useActivateAccountFromInviteMutation();
  const resumeInvite = useResumeAccountInviteMutation();
  const securityCompletionFlightRef = useRef<Promise<void> | null>(null);
  const activationFlightRef = useRef<Promise<void> | null>(null);
  const activationIdempotencyRef = useRef<StableIdempotencyKey | null>(null);

  async function activatePendingAccountInvite(
    pendingIntent: Extract<PendingInviteIntent, { readonly type: 'account_invite' }>,
  ) {
    if (!input.session.currentDeviceId) {
      input.setMessage('No pudimos identificar este telefono para activar la cuenta.');
      return;
    }

    const currentDeviceId = input.session.currentDeviceId;
    await runSingleFlight(activationFlightRef, async () => {
      const signature = `${pendingIntent.token}:${currentDeviceId}`;
      const stableKey = resolveStableIdempotencyKey(
        activationIdempotencyRef.current,
        signature,
        'activate_account_from_invite',
      );
      activationIdempotencyRef.current = stableKey;

      try {
        const response = await activateInvite.mutateAsync({
          deliveryToken: pendingIntent.token,
          currentDeviceId,
          idempotencyKey: stableKey.key,
        });

        await input.session.refreshAccountState({ preserveTrustedDeviceDuringLoad: true });

        if (response.status === 'accepted' || response.status === 'pending_inviter_review') {
          activationIdempotencyRef.current = null;
          await clearPendingInviteIntentIfMatches({
            type: 'account_invite',
            token: pendingIntent.token,
          });
          await beginHomeEntryHandoffAfterScrollReset();
          returnToRoute(router, '/home');
          return;
        }

        input.setMessage('Todavia no pudimos cerrar la invitacion.');
      } catch (error) {
        input.setMessage(
          error instanceof Error
            ? error.message
            : 'No pudimos activar la cuenta con esta invitacion.',
        );
      }
    });
  }

  async function finishSetup() {
    if (input.isSetupPreviewMode) {
      triggerSuccessHaptic();
      input.setMessage('Preview QA: onboarding completado sin crear ni actualizar una cuenta.');
      return;
    }

    const [pendingInviteIntent, pendingNavigationIntent] = await Promise.all([
      readPendingInviteIntent(),
      readPendingNavigationIntent(),
    ]);
    const decision = resolveSetupCompletionRouteDecision({
      accountAccessState: input.session.accountAccessState,
      isTrustedDevice: input.session.isTrustedDevice,
      pendingInviteIntent,
      pendingNavigationIntent,
      returnToProfile: input.returnToProfile,
    });

    if (decision.action === 'activate_account_invite') {
      await activatePendingAccountInvite(decision.intent);
      return;
    }

    if (decision.action === 'resume_account_invite') {
      if (!input.session.currentDeviceId) {
        input.setMessage('No pudimos identificar este teléfono para reanudar la activación.');
        return;
      }

      const stableKey = resolveStableIdempotencyKey(
        activationIdempotencyRef.current,
        `resume:${input.session.currentDeviceId}`,
        'resume_account_invite',
      );
      activationIdempotencyRef.current = stableKey;
      try {
        const response = await resumeInvite.mutateAsync({
          currentDeviceId: input.session.currentDeviceId,
          idempotencyKey: stableKey.key,
        });
        await input.session.refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
        if (response.status === 'accepted' || response.status === 'pending_inviter_review') {
          activationIdempotencyRef.current = null;
          await beginHomeEntryHandoffAfterScrollReset();
          returnToRoute(router, '/home');
          return;
        }
      } catch (error) {
        input.setMessage(
          error instanceof Error
            ? error.message
            : 'No pudimos reanudar la activación de esta cuenta.',
        );
        return;
      }

      input.setMessage('La invitación sigue pendiente. Intenta de nuevo en unos segundos.');
      return;
    }

    if (decision.href === '/join?mode=token') {
      input.setMessage('Perfil guardado. Abre tu enlace de invitacion para activar la cuenta.');
    }
    if (decision.clearPendingAccountInvite && pendingInviteIntent?.type === 'account_invite') {
      await clearPendingInviteIntentIfMatches({
        type: 'account_invite',
        token: pendingInviteIntent.token,
      });
    }
    if (decision.consumePendingNavigationIntentId) {
      await clearPendingNavigationIntentIfMatches(decision.consumePendingNavigationIntentId);
    }
    if (decision.handoff === 'home') {
      await beginHomeEntryHandoffAfterScrollReset();
    }
    returnToRoute(router, decision.href);
  }

  async function finishSecurityOnly() {
    await runSingleFlight(securityCompletionFlightRef, async () => {
      if (!input.session.isTrustedDevice) {
        triggerWarningHaptic();
        input.setMessage('Confía este teléfono para continuar.');
        return;
      }

      if (input.isSetupPreviewMode) {
        triggerSuccessHaptic();
        input.setMessage('Preview QA: seguridad completada sin tocar el backend.');
        return;
      }

      await finishSetup();
    });
  }

  const resetCompletionState = useCallback(() => {
    securityCompletionFlightRef.current = null;
    activationFlightRef.current = null;
    activationIdempotencyRef.current = null;
  }, []);

  return {
    finishSecurityOnly,
    finishSetup,
    isPending: activateInvite.isPending || resumeInvite.isPending,
    resetCompletionState,
  };
}
