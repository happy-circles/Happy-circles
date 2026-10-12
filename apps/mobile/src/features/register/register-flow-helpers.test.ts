import { describe, expect, it } from 'vitest';

import {
  activityRecencyScore,
  buildCorrectionDraft,
  buildCorrectionPendingContent,
  buildDraftPreview,
  formatAmountInput,
  personRelevanceScore,
  resolveRegisterRouteParams,
  sanitizeAmountInput,
  acknowledgedRequestEditId,
  registerCorrectionPrefillKey,
  resolveRegisterEditAction,
} from './register-flow-helpers';

describe('register flow helpers', () => {
  it('routes sender corrections separately from receiver counterproposals', () => {
    expect(
      resolveRegisterRouteParams({
        mode: ['sender_correction'],
        personId: 'person',
        requestId: 'old',
      }).mode,
    ).toBe('sender_correction');
    const sender = {
      kind: 'financial_request' as const,
      status: 'waiting_other_side',
      createdByCurrentUser: true,
      requestKind: 'balance_increase' as const,
    };
    const receiver = { ...sender, status: 'requires_you', createdByCurrentUser: false };
    expect(resolveRegisterEditAction('sender_correction', sender)).toBe('correct');
    expect(resolveRegisterEditAction('correction', receiver)).toBe('amend');
    expect(resolveRegisterEditAction('sender_correction', receiver)).toBeNull();
    expect(resolveRegisterEditAction('correction', sender)).toBeNull();
    expect(
      resolveRegisterEditAction('sender_correction', { ...sender, status: 'amended' }),
    ).toBeNull();
    expect(resolveRegisterEditAction('sender_correction', null)).toBeNull();
  });

  it('blocks a forced sender edit route for reversals or old caches without a known request type', () => {
    const sender = {
      kind: 'financial_request' as const,
      status: 'waiting_other_side',
      createdByCurrentUser: true,
    };
    expect(resolveRegisterEditAction('sender_correction', sender)).toBeNull();
    expect(
      resolveRegisterEditAction('sender_correction', {
        ...sender,
        requestKind: 'transaction_reversal',
      }),
    ).toBeNull();
    expect(
      resolveRegisterEditAction('correction', {
        ...sender,
        createdByCurrentUser: false,
        status: 'requires_you',
        requestKind: 'transaction_reversal',
      }),
    ).toBe('amend');
  });

  it('requires the backend acknowledgement of the new pending version before focusing success', () => {
    expect(
      acknowledgedRequestEditId('correct', {
        originalRequestId: 'old',
        correctedRequestId: 'new',
        status: 'pending',
      }),
    ).toBe('new');
    expect(
      acknowledgedRequestEditId('amend', { amendedRequestId: 'counter', status: 'pending' }),
    ).toBe('counter');
    expect(() =>
      acknowledgedRequestEditId('correct', { requestId: 'old', status: 'pending' }),
    ).toThrow('no confirmó');
    expect(() =>
      acknowledgedRequestEditId('correct', { correctedRequestId: 'new', status: 'canceled' }),
    ).toThrow();
    expect(() => acknowledgedRequestEditId('amend', null)).toThrow();
  });

  it('identifies prefill by mode and request identity instead of refreshed content', () => {
    const identity = { mode: 'sender_correction' as const, personId: 'person', requestId: 'old' };
    expect(registerCorrectionPrefillKey(identity)).toBe(
      registerCorrectionPrefillKey({ ...identity }),
    );
    expect(registerCorrectionPrefillKey(identity)).not.toBe(
      registerCorrectionPrefillKey({ ...identity, requestId: 'new' }),
    );
    expect(registerCorrectionPrefillKey(identity)).not.toBe(
      registerCorrectionPrefillKey({ ...identity, mode: 'correction' }),
    );
  });
  it('normalizes amount input without screen state', () => {
    expect(sanitizeAmountInput('$ 120.500 cop')).toBe('120500');
    expect(formatAmountInput('')).toBe('');
    expect(formatAmountInput('0')).toBe('');
    expect(formatAmountInput('120500')).toBe('120.500');
  });

  it('derives route defaults from params', () => {
    expect(resolveRegisterRouteParams({})).toEqual({
      correctionRequestId: '',
      contextualDirection: null,
      contextualPersonId: '',
      initialDirection: 'i_owe',
      mode: 'create',
    });
    expect(
      resolveRegisterRouteParams({
        direction: ['owes_me', 'i_owe'],
        personId: 'user-1',
      }),
    ).toEqual({
      correctionRequestId: '',
      contextualDirection: 'owes_me',
      contextualPersonId: 'user-1',
      initialDirection: 'owes_me',
      mode: 'create',
    });
    expect(
      resolveRegisterRouteParams({
        direction: 'unknown',
        mode: 'correction',
        personId: ['ignored'],
        requestId: 'request-1',
      }),
    ).toEqual({
      correctionRequestId: 'request-1',
      contextualDirection: null,
      contextualPersonId: '',
      initialDirection: 'i_owe',
      mode: 'correction',
    });
  });

  it('builds correction drafts from the current pending instance', () => {
    expect(
      buildCorrectionDraft({
        amountMinor: 30_000,
        category: 'food_drinks',
        id: 'request-1',
        kind: 'financial_request',
        pendingHistorySteps: [
          {
            amountMinor: 20_000,
            category: 'transport',
            createdAtLabel: 'ayer',
            createdByLabel: 'Ana',
            description: 'Taxi',
            id: 'first',
            isCurrent: false,
            status: 'amended',
            title: 'Propuesta inicial',
          },
          {
            amountMinor: 45_000,
            category: 'services',
            createdAtLabel: 'hoy',
            createdByLabel: 'Tú',
            description: 'Soporte',
            id: 'current',
            isCurrent: true,
            status: 'pending',
            title: 'Monto actual',
          },
        ],
        status: 'requires_you',
        subtitle: 'Ana | Taxi | hoy',
        title: 'Entrada propuesta',
        tone: 'positive',
      }),
    ).toEqual({
      amount: '450',
      category: 'services',
      description: 'Soporte',
      direction: 'owes_me',
    });
  });

  it('reuses pending movement content for correction context', () => {
    expect(
      buildCorrectionPendingContent({
        amountMinor: 30_000,
        category: 'food_drinks',
        id: 'request-1',
        kind: 'financial_request',
        pendingHistorySteps: [],
        status: 'requires_you',
        subtitle: 'Ana | Pizza | hace 2 dias',
        title: 'Entrada propuesta',
        tone: 'positive',
      }),
    ).toEqual({
      createdAtLabel: 'hace 2 dias',
      createdByLabel: 'Ana',
      detail: 'Pizza',
    });

    expect(
      buildCorrectionPendingContent({
        amountMinor: 30_000,
        category: 'food_drinks',
        id: 'request-1',
        kind: 'financial_request',
        pendingHistorySteps: [],
        status: 'requires_you',
        subtitle: '',
        title: 'Entrada propuesta',
        tone: 'positive',
      }),
    ).toEqual({
      createdAtLabel: '',
      createdByLabel: 'Persona',
      detail: '',
    });
  });

  it('keeps preview copy and tone deterministic', () => {
    expect(
      buildDraftPreview({
        amountMinor: 500_000,
        counterpartyName: 'Ana',
        direction: 'owes_me',
      }),
    ).toEqual({
      summary: 'Ana te debe $\u00a05.000.',
      tone: 'owes_me',
    });
    expect(
      buildDraftPreview({
        amountMinor: 500_000,
        counterpartyName: 'Ana',
        direction: 'i_owe',
      }),
    ).toEqual({
      summary: 'Debes $\u00a05.000 a Ana.',
      tone: 'i_owe',
    });
  });

  it('ranks people by pending work, recency and balance weight', () => {
    expect(activityRecencyScore('Sin movimientos todavía')).toBe(0);
    expect(activityRecencyScore('hace 5 min')).toBe(140);
    expect(activityRecencyScore('Hoy')).toBe(120);
    expect(activityRecencyScore('Ayer')).toBe(90);
    expect(activityRecencyScore('hace 2 horas')).toBe(98);
    expect(activityRecencyScore('esta semana')).toBe(20);

    const quietPerson = personRelevanceScore({
      displayName: 'Beto',
      lastActivityLabel: 'Sin movimientos todavía',
      netAmountMinor: 0,
      pendingCount: 0,
      userId: 'beto',
    });
    const activePerson = personRelevanceScore({
      displayName: 'Ana',
      lastActivityLabel: 'hace 5 min',
      netAmountMinor: 900_000,
      pendingCount: 2,
      userId: 'ana',
    });

    expect(activePerson).toBeGreaterThan(quietPerson);
  });
});
