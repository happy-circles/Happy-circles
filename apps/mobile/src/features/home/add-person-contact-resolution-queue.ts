import { CONTACT_TARGET_RESOLUTION_LIMIT } from '@/features/home/contacts-sheet-helpers';
import { type PeopleTargetResolution } from '@/lib/live-data';

type MutableRef<T> = {
  current: T;
};

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

const CONTACT_RESOLUTION_FAILURE_MESSAGE =
  'No pudimos revisar algunos numeros de tu agenda. Puedes seguir agregando los contactos que aparecen.';

export async function pumpAddPersonResolutionQueue({
  inFlightResolutionSetRef,
  mergeAndPersistTargetResolutions,
  pendingResolutionQueueRef,
  pendingResolutionSetRef,
  resolutionPumpRunningRef,
  resolvePeopleTargetsMutateRef,
  scanRunIdRef,
  setMessage,
  targetCacheRef,
  visibleResolutionPhonesRef,
}: {
  readonly inFlightResolutionSetRef: MutableRef<Set<string>>;
  readonly mergeAndPersistTargetResolutions: (
    resolutions: readonly PeopleTargetResolution[],
  ) => void;
  readonly pendingResolutionQueueRef: MutableRef<string[]>;
  readonly pendingResolutionSetRef: MutableRef<Set<string>>;
  readonly resolutionPumpRunningRef: MutableRef<boolean>;
  readonly resolvePeopleTargetsMutateRef: MutableRef<
    (phoneE164List: readonly string[]) => Promise<readonly PeopleTargetResolution[]>
  >;
  readonly scanRunIdRef: MutableRef<number>;
  readonly setMessage: StateSetter<string | null>;
  readonly targetCacheRef: MutableRef<Record<string, PeopleTargetResolution>>;
  readonly visibleResolutionPhonesRef: MutableRef<Set<string>>;
}) {
  if (resolutionPumpRunningRef.current) {
    return;
  }

  resolutionPumpRunningRef.current = true;
  const activeRunId = scanRunIdRef.current;

  try {
    while (scanRunIdRef.current === activeRunId && pendingResolutionQueueRef.current.length > 0) {
      const batch: string[] = [];
      while (
        batch.length < CONTACT_TARGET_RESOLUTION_LIMIT &&
        pendingResolutionQueueRef.current.length > 0
      ) {
        const phoneE164 = pendingResolutionQueueRef.current.shift();
        if (!phoneE164) {
          continue;
        }

        pendingResolutionSetRef.current.delete(phoneE164);
        if (targetCacheRef.current[phoneE164] || inFlightResolutionSetRef.current.has(phoneE164)) {
          continue;
        }

        batch.push(phoneE164);
      }

      if (batch.length === 0) {
        continue;
      }

      for (const phoneE164 of batch) {
        inFlightResolutionSetRef.current.add(phoneE164);
      }

      try {
        const resolutions = await resolvePeopleTargetsMutateRef.current(batch);
        if (scanRunIdRef.current === activeRunId) {
          mergeAndPersistTargetResolutions(resolutions);
        }
      } catch (error) {
        const affectsVisibleContact = batch.some((phoneE164) =>
          visibleResolutionPhonesRef.current.has(phoneE164),
        );
        if (affectsVisibleContact && scanRunIdRef.current === activeRunId) {
          setMessage(formatContactResolutionError(error));
        }
      } finally {
        if (scanRunIdRef.current === activeRunId) {
          for (const phoneE164 of batch) {
            inFlightResolutionSetRef.current.delete(phoneE164);
          }
        }
      }
    }
  } finally {
    resolutionPumpRunningRef.current = false;
    if (pendingResolutionQueueRef.current.length > 0) {
      void pumpAddPersonResolutionQueue({
        inFlightResolutionSetRef,
        mergeAndPersistTargetResolutions,
        pendingResolutionQueueRef,
        pendingResolutionSetRef,
        resolutionPumpRunningRef,
        resolvePeopleTargetsMutateRef,
        scanRunIdRef,
        setMessage,
        targetCacheRef,
        visibleResolutionPhonesRef,
      });
    }
  }
}

function formatContactResolutionError(error: unknown): string {
  if (isValidationError(error)) {
    return CONTACT_RESOLUTION_FAILURE_MESSAGE;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'No se pudo revisar esta parte de tu agenda.';
}

function isValidationError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'ZodError') {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { readonly issues?: unknown }).issues)
  );
}
