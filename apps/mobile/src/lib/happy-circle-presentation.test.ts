import { describe, expect, it } from 'vitest';

import { resolveHappyCirclePresentation } from './happy-circle-presentation';

describe('happy circle presentation', () => {
  it('separates own pending approvals from waiting on others', () => {
    expect(
      resolveHappyCirclePresentation({
        approvalsPending: 2,
        myDecision: 'pending',
        status: 'pending_approvals',
      }),
    ).toMatchObject({
      actionability: 'can_decide',
      key: 'pending_own',
      label: 'Necesita tu aprobacion',
      tone: 'warning',
    });

    expect(
      resolveHappyCirclePresentation({
        approvalsPending: 1,
        myDecision: 'approved',
        status: 'pending_approvals',
      }),
    ).toMatchObject({
      actionability: 'waiting',
      key: 'waiting_others',
      label: 'Esperando aprobaciones',
      tone: 'neutral',
    });
  });

  it('maps approved and terminal proposal states to card states', () => {
    expect(resolveHappyCirclePresentation({ status: 'approved' })).toMatchObject({
      actionability: 'ready',
      key: 'approved',
      label: 'Listo para completar',
      tone: 'cycle',
    });
    expect(resolveHappyCirclePresentation({ status: 'executed' })).toMatchObject({
      actionability: 'closed',
      key: 'executed',
      tone: 'success',
    });
    expect(resolveHappyCirclePresentation({ status: 'rejected' })).toMatchObject({
      actionability: 'closed',
      key: 'rejected',
      tone: 'danger',
    });
    expect(resolveHappyCirclePresentation({ status: 'stale' })).toMatchObject({
      actionability: 'closed',
      key: 'stale',
      tone: 'neutral',
    });
    expect(resolveHappyCirclePresentation({ status: 'expired' })).toMatchObject({
      actionability: 'closed',
      key: 'expired',
      tone: 'neutral',
    });
  });
});
