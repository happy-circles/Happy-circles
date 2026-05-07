import type { BrandVerificationState } from '@/components/brand-verification-lockup';
import { IdentityFlowIdentity } from '@/components/identity-flow';

export function AuthEntryIdentity({
  avatarLabel,
  avatarUrl,
  centerFaceSize = 'small',
  disabled,
  state,
  variant = 'brand',
}: {
  readonly avatarLabel?: string;
  readonly avatarUrl?: string | null;
  readonly centerFaceSize?: 'large' | 'small';
  readonly disabled?: boolean;
  readonly state: BrandVerificationState;
  readonly variant?: 'brand' | 'remembered';
}) {
  return (
    <IdentityFlowIdentity
      avatarLabel={avatarLabel}
      avatarUrl={avatarUrl}
      centerFaceSize={variant === 'brand' ? centerFaceSize : undefined}
      disabled={disabled}
      state={state}
      variant={variant}
    />
  );
}
