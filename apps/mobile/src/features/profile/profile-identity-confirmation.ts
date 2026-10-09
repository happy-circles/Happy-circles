import {
  isIdentityConfirmationCancelled,
  type ActionIdentityConfirmationInput,
  type ConfirmActionIdentity,
} from '@/lib/live-data/mutations/sensitive-action-check';

export async function confirmProfileIdentity(
  confirmIdentity: ConfirmActionIdentity,
  input: ActionIdentityConfirmationInput,
  showMessage: (message: string) => void,
): Promise<boolean> {
  try {
    return await confirmIdentity(input);
  } catch (error) {
    if (!isIdentityConfirmationCancelled(error)) {
      showMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos confirmar tu identidad. Inténtalo de nuevo.',
      );
    }
    return false;
  }
}
