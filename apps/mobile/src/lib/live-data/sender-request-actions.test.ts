import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (value: Record<string, unknown>) => value.web ?? value.default },
}));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async () => new ArrayBuffer(32)),
  randomUUID: vi.fn(),
  getRandomValues: vi.fn((value: Uint8Array) => value),
}));

import type { FinancialRequestRow, LiveSnapshotRows } from './types';
import {
  buildPendingFinancialRequestItems,
  buildPendingRequestHistorySteps,
  buildPersonTimeline,
  buildRequestCreatedTitle,
  buildRequestResolutionTitle,
  resolveRootRequestId,
} from './builders/financial-requests';
import {
  applyHistorySyncPage,
  emptyHistorySyncState,
  mergeHistoryWithLiveRows,
} from './history-sync';

const ACTOR = 'sender';
const FRIEND = 'receiver';
const names = new Map([
  [ACTOR, 'Ana'],
  [FRIEND, 'Sofia'],
]);
const WHEN = '2026-10-12T12:00:00.000Z';
function request(overrides: Partial<FinancialRequestRow> = {}): FinancialRequestRow {
  return {
    id: 'one',
    relationship_id: 'relationship',
    request_type: 'balance_increase',
    status: 'pending',
    creator_user_id: ACTOR,
    responder_user_id: FRIEND,
    debtor_user_id: FRIEND,
    creditor_user_id: ACTOR,
    amount_minor: 1500,
    currency_code: 'COP',
    description: 'Lunch',
    category: 'food_drinks',
    parent_request_id: null,
    target_ledger_transaction_id: null,
    created_at: WHEN,
    updated_at: WHEN,
    resolved_at: null,
    ...overrides,
  };
}

describe('sender request versions and history', () => {
  it('keeps all 25 versions and one case even when legacy rows lack the case identifier', () => {
    const versions = Array.from({ length: 25 }, (_, index) =>
      request({
        id: `version-${index}`,
        parent_request_id: index ? `version-${index - 1}` : null,
        status: index === 24 ? 'pending' : 'amended',
        version_number: index + 1,
        amendment_kind: index ? 'sender_correction' : null,
        resolved_by_user_id: index === 24 ? null : ACTOR,
      }),
    );
    const byId = new Map(versions.map((row) => [row.id, row]));
    const current = versions[24];
    expect(resolveRootRequestId(current.id, byId)).toBe('version-0');
    const steps = buildPendingRequestHistorySteps({
      request: current,
      requestsById: byId,
      currentUserId: ACTOR,
      counterpartyName: 'Sofia',
      names,
      nowMs: Date.parse(WHEN),
    });
    expect(steps).toHaveLength(25);
    expect(steps[0]?.id).toBe('version-0');
    expect(steps[24]).toMatchObject({ id: current.id, isCurrent: true });
    const timeline = buildPersonTimeline({
      requests: versions,
      historyRows: [],
      currentUserId: ACTOR,
      counterpartyName: 'Sofia',
      names,
      nowMs: Date.parse(WHEN),
    });
    expect(new Set(timeline.map((item) => item.originRequestId))).toEqual(new Set(['version-0']));
    expect(new Set(timeline.map((item) => item.id)).size).toBe(timeline.length);
  });
  it('uses the canonical case identifier when an older ancestor has not been loaded yet', () => {
    const current = request({
      id: 'third',
      parent_request_id: 'unloaded-second',
      request_case_id: 'first',
      version_number: 3,
    });
    expect(resolveRootRequestId(current.id, new Map([[current.id, current]]))).toBe('first');
  });
  it('terminates safely on a corrupt parent cycle without truncating valid history', () => {
    const one = request({ id: 'one', parent_request_id: 'two' });
    const two = request({ id: 'two', parent_request_id: 'one' });
    const byId = new Map([
      [one.id, one],
      [two.id, two],
    ]);
    expect(['one', 'two']).toContain(resolveRootRequestId(one.id, byId));
    expect(
      buildPendingRequestHistorySteps({
        request: one,
        requestsById: byId,
        currentUserId: ACTOR,
        counterpartyName: 'Sofia',
        names,
        nowMs: Date.parse(WHEN),
      }),
    ).toHaveLength(2);
  });
  it('distinguishes sender corrections from receiver counterproposals and identifies the current sender', () => {
    const parent = request({ status: 'amended', resolved_by_user_id: ACTOR });
    const correction = request({
      id: 'corrected',
      parent_request_id: parent.id,
      amendment_kind: 'sender_correction',
      version_number: 2,
    });
    const counter = request({
      id: 'counter',
      parent_request_id: parent.id,
      amendment_kind: 'counterproposal',
      creator_user_id: FRIEND,
      responder_user_id: ACTOR,
      version_number: 2,
    });
    expect(buildRequestResolutionTitle(parent, ACTOR, 'Sofia', names)).toBe(
      'Tú corrigió su solicitud',
    );
    expect(buildRequestCreatedTitle(correction, ACTOR, 'Sofia', names)).toBe(
      'Tú corrigió su solicitud',
    );
    expect(buildRequestCreatedTitle(counter, ACTOR, 'Sofia', names)).toBe(
      'Sofia propuso un nuevo monto',
    );
    const build = (current: FinancialRequestRow) =>
      buildPendingFinancialRequestItems({
        financialRequests: [current],
        financialRequestsById: new Map([
          [parent.id, parent],
          [current.id, current],
        ]),
        counterpartyByRelationshipId: new Map([
          ['relationship', { userId: FRIEND, displayName: 'Sofia' }],
        ]),
        currentUserId: ACTOR,
        names,
        nowMs: Date.parse(WHEN),
      })[0];
    expect(build(correction)).toMatchObject({
      createdByCurrentUser: true,
      status: 'waiting_other_side',
      versionNumber: 2,
    });
    expect(build(counter)).toMatchObject({
      createdByCurrentUser: false,
      status: 'requires_you',
      versionNumber: 2,
    });
    expect(correction.debtor_user_id).toBe(counter.debtor_user_id);
    expect(correction.creditor_user_id).toBe(counter.creditor_user_id);
  });
  it('attributes cancellation to its author from either account and preserves the origin kind on later resolution', () => {
    const closed = request({
      id: 'corrected',
      parent_request_id: 'one',
      status: 'canceled',
      amendment_kind: 'sender_correction',
      resolved_by_user_id: ACTOR,
    });
    expect(buildRequestResolutionTitle(closed, FRIEND, 'Ana', names)).toBe(
      'Ana canceló su solicitud',
    );
    expect(buildRequestCreatedTitle(closed, FRIEND, 'Ana', names)).toBe(
      'Ana corrigió su solicitud',
    );
  });
  it('merges repeated incremental closure pages with the active child and later cancellation without duplicates', () => {
    const parent = request({ status: 'amended', resolved_by_user_id: ACTOR, resolved_at: WHEN });
    const child = request({
      id: 'two',
      parent_request_id: parent.id,
      amendment_kind: 'sender_correction',
      request_case_id: parent.id,
      version_number: 2,
    });
    const page = {
      protocol: 1,
      cursor: '11111111-1111-4111-8111-111111111111:1',
      hasMore: false,
      reset: false,
      changes: [{ collection: 'financialRequests', key: parent.id, row: parent }],
    };
    let state = applyHistorySyncPage(emptyHistorySyncState(), page);
    state = applyHistorySyncPage(state, page);
    const live = {
      financialRequests: [child],
      ...Object.fromEntries(
        Object.keys(state.collections)
          .filter((name) => name !== 'financialRequests')
          .map((name) => [name, []]),
      ),
    } as unknown as LiveSnapshotRows;
    expect(mergeHistoryWithLiveRows(live, state).financialRequests.map((row) => row.id)).toEqual([
      'one',
      'two',
    ]);
    const canceled = {
      ...child,
      status: 'canceled',
      resolved_at: WHEN,
      resolved_by_user_id: ACTOR,
    };
    state = applyHistorySyncPage(state, {
      ...page,
      cursor: '11111111-1111-4111-8111-111111111111:2',
      changes: [{ collection: 'financialRequests', key: child.id, row: canceled }],
    });
    const rows = mergeHistoryWithLiveRows(
      { ...live, financialRequests: [] },
      state,
    ).financialRequests;
    expect(rows.filter((row) => row.status === 'pending')).toHaveLength(0);
    const timeline = buildPersonTimeline({
      requests: rows,
      historyRows: [],
      currentUserId: FRIEND,
      counterpartyName: 'Ana',
      names,
      nowMs: Date.parse(WHEN),
    });
    expect(timeline.filter((item) => item.id === 'two:canceled')).toHaveLength(1);
  });
});
