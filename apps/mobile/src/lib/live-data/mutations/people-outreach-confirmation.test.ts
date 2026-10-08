import { describe, expect, it } from 'vitest';
import type { PeopleOutreachResult, PeopleTargetResolution } from '../types-runtime';
import {
  contactResolutionForOutreach,
  friendshipOutreachOutcome,
} from './people-outreach-confirmation';

const previous: PeopleTargetResolution = {
  phoneE164: '+573001234567',
  status: 'active_user',
  matchedUserId: 'ana',
  displayName: 'Ana',
  avatarPath: 'avatar',
  friendshipInviteId: null,
  relationshipId: null,
  accountInviteId: null,
  accountInviteStatus: null,
  discoveryWatchId: 'watch',
  discoverySessionId: 'session',
};

describe('authoritative outreach confirmation', () => {
  it('turns a newly sent friendship into a pending row and preserves the temporary watch', () => {
    const response: PeopleOutreachResult = {
      kind: 'friendship',
      status: 'active_user',
      matchedUserId: 'ana',
      displayName: 'Ana',
      result: {
        inviteId: 'friendship',
        status: 'pending_recipient',
        created: true,
        friendshipDirection: 'outgoing',
      },
    };
    expect(contactResolutionForOutreach(previous.phoneE164, response, previous)).toMatchObject({
      status: 'pending_friendship',
      friendshipInviteId: 'friendship',
      friendshipDirection: 'outgoing',
      discoveryWatchId: 'watch',
      discoverySessionId: 'session',
      avatarPath: 'avatar',
      availableActions: ['open_request'],
    });
  });

  it('uses explicit created=false and incoming direction even when a legacy status suggests a new send', () => {
    const response: PeopleOutreachResult = {
      kind: 'friendship',
      status: 'active_user',
      matchedUserId: 'ana',
      displayName: 'Ana',
      friendshipDirection: 'incoming',
      result: { inviteId: 'existing', status: 'pending_recipient', created: false },
    };
    expect(friendshipOutreachOutcome(response)).toMatchObject({
      created: false,
      direction: 'incoming',
      inviteId: 'existing',
    });
  });

  it('clears obsolete pending ids when the command finds an existing relationship', () => {
    const row = contactResolutionForOutreach(
      previous.phoneE164,
      {
        kind: 'already_related',
        status: 'already_related',
        matchedUserId: 'ana',
        displayName: 'Ana',
        relationshipId: 'relation',
      },
      {
        ...previous,
        friendshipInviteId: 'old',
        accountInviteId: 'old-access',
        accountInviteStatus: 'pending_activation',
      },
    );
    expect(row).toMatchObject({
      relationshipId: 'relation',
      friendshipInviteId: null,
      accountInviteId: null,
      friendshipDirection: null,
      availableActions: [],
    });
  });
});
