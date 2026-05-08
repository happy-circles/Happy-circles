import { describe, expect, it } from 'vitest';

import { resolveCenteredIdentityFlowScrollY } from '@/lib/identity-flow-scroll';

describe('identity flow scroll coordinator', () => {
  it('scrolls down when the identity target is below viewport center', () => {
    expect(
      resolveCenteredIdentityFlowScrollY({
        currentScrollY: 120,
        targetHeight: 200,
        targetY: 520,
        viewportHeight: 800,
      }),
    ).toBe(340);
  });

  it('scrolls up when the identity target is above viewport center', () => {
    expect(
      resolveCenteredIdentityFlowScrollY({
        currentScrollY: 360,
        targetHeight: 200,
        targetY: 40,
        viewportHeight: 800,
      }),
    ).toBe(100);
  });

  it('clamps to the top when the centered target would require negative scroll', () => {
    expect(
      resolveCenteredIdentityFlowScrollY({
        currentScrollY: 0,
        targetHeight: 200,
        targetY: 80,
        viewportHeight: 800,
      }),
    ).toBe(0);
  });
});
