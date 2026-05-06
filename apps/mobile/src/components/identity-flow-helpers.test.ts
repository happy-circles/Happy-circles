import { describe, expect, it } from 'vitest';

import { resolveIdentityFlowLayout } from './identity-flow-helpers';

describe('identity flow helpers', () => {
  it('resolves auto identity position to centered layout', () => {
    expect(
      resolveIdentityFlowLayout({
        bodyHeight: 800,
        centerLayout: 'balanced',
        hasMessage: false,
        identityPosition: 'auto',
        layoutReady: true,
        stageSize: 200,
        topOffset: 40,
        verticalGap: 24,
      }),
    ).toEqual({
      centerContentY: 476,
      centerIdentityY: 252,
      isCenterIdentity: true,
      resolvedIdentityPosition: 'center',
      shouldReserveMessageSlot: true,
      topContentY: 264,
      topIdentityY: 40,
    });
  });

  it('keeps top identity layout stable before measurement is ready', () => {
    expect(
      resolveIdentityFlowLayout({
        bodyHeight: 800,
        centerLayout: 'compact',
        hasMessage: true,
        identityPosition: 'top',
        layoutReady: false,
        stageSize: 160,
        topOffset: 52,
        verticalGap: 20,
      }),
    ).toEqual({
      centerContentY: 232,
      centerIdentityY: 52,
      isCenterIdentity: false,
      resolvedIdentityPosition: 'top',
      shouldReserveMessageSlot: true,
      topContentY: 232,
      topIdentityY: 52,
    });
  });
});
