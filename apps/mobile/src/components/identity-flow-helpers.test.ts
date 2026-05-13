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

  it('keeps form-forward layouts top-aligned after measurement is ready', () => {
    expect(
      resolveIdentityFlowLayout({
        bodyHeight: 600,
        centerLayout: 'balanced',
        hasMessage: true,
        identityPosition: 'top',
        layoutReady: true,
        stageSize: 208,
        topOffset: 40,
        verticalGap: 8,
      }),
    ).toEqual({
      centerContentY: 376,
      centerIdentityY: 160,
      isCenterIdentity: false,
      resolvedIdentityPosition: 'top',
      shouldReserveMessageSlot: true,
      topContentY: 256,
      topIdentityY: 40,
    });
  });

  it('uses a more compact center for short compact identity states', () => {
    expect(
      resolveIdentityFlowLayout({
        bodyHeight: 600,
        centerLayout: 'compact',
        hasMessage: true,
        identityPosition: 'center',
        layoutReady: true,
        stageSize: 160,
        topOffset: 52,
        verticalGap: 20,
      }),
    ).toEqual({
      centerContentY: 292,
      centerIdentityY: 112,
      isCenterIdentity: true,
      resolvedIdentityPosition: 'center',
      shouldReserveMessageSlot: true,
      topContentY: 232,
      topIdentityY: 52,
    });
  });

  it('keeps centered measured content inside the available body height', () => {
    expect(
      resolveIdentityFlowLayout({
        bodyHeight: 500,
        centerLayout: 'balanced',
        contentHeight: 240,
        hasMessage: true,
        identityPosition: 'center',
        layoutReady: true,
        stageSize: 208,
        topOffset: 40,
        verticalGap: 8,
      }),
    ).toEqual({
      centerContentY: 260,
      centerIdentityY: 44,
      isCenterIdentity: true,
      resolvedIdentityPosition: 'center',
      shouldReserveMessageSlot: true,
      topContentY: 256,
      topIdentityY: 40,
    });
  });
});
