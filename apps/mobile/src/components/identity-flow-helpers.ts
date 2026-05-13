export type IdentityFlowCenterLayout = 'balanced' | 'compact';
export type IdentityFlowIdentityPosition = 'auto' | 'center' | 'top';

export function resolveIdentityFlowLayout(input: {
  readonly bodyHeight: number;
  readonly centerLayout: IdentityFlowCenterLayout;
  readonly contentHeight?: number;
  readonly hasMessage: boolean;
  readonly identityPosition: IdentityFlowIdentityPosition;
  readonly layoutReady: boolean;
  readonly stageSize: number;
  readonly topOffset: number;
  readonly verticalGap: number;
}): {
  readonly centerContentY: number;
  readonly centerIdentityY: number;
  readonly isCenterIdentity: boolean;
  readonly resolvedIdentityPosition: Exclude<IdentityFlowIdentityPosition, 'auto'>;
  readonly shouldReserveMessageSlot: boolean;
  readonly topContentY: number;
  readonly topIdentityY: number;
} {
  const resolvedIdentityPosition =
    input.identityPosition === 'auto' ? 'center' : input.identityPosition;
  const isCenterIdentity = resolvedIdentityPosition === 'center';
  const topIdentityY = input.topOffset;
  const centerRestRatio = input.centerLayout === 'compact' ? 0.32 : 0.44;
  const preferredCenterIdentityY = input.bodyHeight / 2 - input.stageSize / 2;
  const readableCenterIdentityY = input.bodyHeight * centerRestRatio - input.stageSize / 2;
  const contentHeight = Math.max(0, input.contentHeight ?? 0);
  const centeredGroupHeight =
    contentHeight > 0 ? input.stageSize + input.verticalGap + contentHeight : 0;
  const maxFittingCenterIdentityY =
    centeredGroupHeight > 0
      ? Math.max(topIdentityY, input.bodyHeight - centeredGroupHeight)
      : Number.POSITIVE_INFINITY;
  const centerIdentityY = input.layoutReady
    ? Math.max(
        topIdentityY,
        Math.min(preferredCenterIdentityY, readableCenterIdentityY, maxFittingCenterIdentityY),
      )
    : topIdentityY;
  const topContentY = topIdentityY + input.stageSize + input.verticalGap;
  const centerContentY = centerIdentityY + input.stageSize + input.verticalGap;

  return {
    centerContentY,
    centerIdentityY,
    isCenterIdentity,
    resolvedIdentityPosition,
    shouldReserveMessageSlot: input.hasMessage || resolvedIdentityPosition === 'center',
    topContentY,
    topIdentityY,
  };
}
