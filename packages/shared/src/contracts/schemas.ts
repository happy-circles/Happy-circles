import { z } from 'zod';

import {
  ACCOUNT_KINDS,
  ACCOUNT_ACCESS_STATES,
  ACCOUNT_INVITE_CHANNELS,
  ACCOUNT_INVITE_STATUSES,
  AUDIT_ENTITY_TYPES,
  AUDIT_EVENT_NAMES,
  CURRENCY_CODE,
  ENTRY_SIDES,
  FRIENDSHIP_INVITE_CHANNELS,
  FRIENDSHIP_INVITE_FLOWS,
  FRIENDSHIP_INVITE_STATUSES,
  PARTICIPANT_DECISIONS,
  PEOPLE_TARGET_STATUSES,
  PROPOSAL_STATUSES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  TRANSACTION_CATEGORIES,
  TRANSACTION_SOURCE_TYPES,
  TRANSACTION_TYPES,
} from './enums';

export const uuidSchema = z.string().uuid();
export const idempotencyKeySchema = z.string().min(8).max(128);
export const moneyMinorSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const requestTypeSchema = z.enum(REQUEST_TYPES);
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const transactionCategorySchema = z.enum(TRANSACTION_CATEGORIES);
export const userTransactionCategorySchema = transactionCategorySchema.refine(
  (value) => value !== 'cycle',
  {
    message: 'La categoria ciclo esta reservada para cierres automaticos.',
  },
);
export const transactionSourceTypeSchema = z.enum(TRANSACTION_SOURCE_TYPES);
export const accountKindSchema = z.enum(ACCOUNT_KINDS);
export const entrySideSchema = z.enum(ENTRY_SIDES);
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export const participantDecisionSchema = z.enum(PARTICIPANT_DECISIONS);
export const auditEntityTypeSchema = z.enum(AUDIT_ENTITY_TYPES);
export const auditEventNameSchema = z.enum(AUDIT_EVENT_NAMES);
export const friendshipInviteFlowSchema = z.enum(FRIENDSHIP_INVITE_FLOWS);
export const friendshipInviteStatusSchema = z.enum(FRIENDSHIP_INVITE_STATUSES);
export const friendshipInviteChannelSchema = z.enum(FRIENDSHIP_INVITE_CHANNELS);
export const accountAccessStateSchema = z.enum(ACCOUNT_ACCESS_STATES);
export const accountInviteStatusSchema = z.enum(ACCOUNT_INVITE_STATUSES);
export const accountInviteChannelSchema = z.enum(ACCOUNT_INVITE_CHANNELS);
export const peopleTargetStatusSchema = z.enum(PEOPLE_TARGET_STATUSES);

export const createBalanceRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  responderUserId: uuidSchema,
  debtorUserId: uuidSchema,
  creditorUserId: uuidSchema,
  amountMinor: moneyMinorSchema,
  description: z.string().trim().min(1).max(240),
  category: userTransactionCategorySchema.default('other'),
  currencyCode: z.literal(CURRENCY_CODE).default(CURRENCY_CODE),
  requestKind: z.literal('balance_increase'),
});

export const amendFinancialRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  requestId: uuidSchema,
  amountMinor: moneyMinorSchema,
  description: z.string().trim().min(1).max(240),
  category: userTransactionCategorySchema.default('other'),
});

export const requestDecisionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  requestId: uuidSchema,
});

export const createInternalFriendshipInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  targetUserId: uuidSchema,
  sourceContext: z.string().trim().min(1).max(80).optional(),
});

export const friendshipInviteDecisionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  inviteId: uuidSchema,
  decision: z.enum(['accept', 'reject']),
});

export const createExternalFriendshipInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  channel: friendshipInviteChannelSchema.refine((value) => value !== 'internal', {
    message: 'El canal externo debe ser remote o qr.',
  }),
  sourceContext: z.string().trim().min(1).max(80).optional(),
  intendedRecipientAlias: z.string().trim().min(1).max(120).optional(),
  intendedRecipientPhoneE164: z.string().trim().min(8).max(24).optional(),
  intendedRecipientPhoneLabel: z.string().trim().min(1).max(40).optional(),
}).superRefine((value, context) => {
  if (value.channel === 'remote') {
    if (!value.intendedRecipientAlias) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La invitacion remota requiere un alias de contacto.',
        path: ['intendedRecipientAlias'],
      });
    }

    if (!value.intendedRecipientPhoneE164) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La invitacion remota requiere un numero de contacto.',
        path: ['intendedRecipientPhoneE164'],
      });
    }
  }
});

export const friendshipInviteTokenSchema = z.object({
  deliveryToken: z.string().trim().min(12).max(128),
});

export const claimExternalFriendshipInviteSchema = friendshipInviteTokenSchema.extend({
  idempotencyKey: idempotencyKeySchema,
});

export const reviewExternalFriendshipInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  inviteId: uuidSchema,
  decision: z.enum(['approve', 'reject']),
});

export const friendshipInvitePreviewSchema = friendshipInviteTokenSchema;

export const resolvePeopleTargetsSchema = z.object({
  phoneE164List: z.array(z.string().trim().min(8).max(24)).min(1).max(60),
});

export const createAccountInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  channel: accountInviteChannelSchema,
  sourceContext: z.string().trim().min(1).max(80).optional(),
  intendedRecipientAlias: z.string().trim().min(1).max(120),
  intendedRecipientPhoneE164: z.string().trim().min(8).max(24),
  intendedRecipientPhoneLabel: z.string().trim().min(1).max(40).optional(),
});

export const createPeopleOutreachSchema = createAccountInviteSchema;

export const accountInviteTokenSchema = z.object({
  deliveryToken: z.string().trim().min(12).max(128),
});

export const accountInvitePreviewSchema = accountInviteTokenSchema;

export const activateAccountFromInviteSchema = accountInviteTokenSchema.extend({
  idempotencyKey: idempotencyKeySchema,
  currentDeviceId: z.string().trim().min(6).max(200),
});

export const reviewAccountInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  inviteId: uuidSchema,
  decision: z.enum(['approve', 'reject']),
});

export const cancelFriendshipInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  inviteId: uuidSchema,
});

export const emailPasswordSignInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

const phoneProfileFields = {
  phoneCountryIso2: z.string().trim().length(2),
  phoneCountryCallingCode: z.string().trim().min(2).max(6),
  phoneNationalNumber: z.string().trim().min(6).max(20),
};

export const registrationSchema = emailPasswordSignInSchema
  .extend({
    confirmPassword: z.string().min(8).max(72),
    ...phoneProfileFields,
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las claves no coinciden.',
        path: ['confirmPassword'],
      });
    }
  });

export const completeProfileSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  ...phoneProfileFields,
});

export const attachEmailPasswordSchema = z
  .object({
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las claves no coinciden.',
        path: ['confirmPassword'],
      });
    }
  });

export const passwordResetSchema = z
  .object({
    password: z.string().min(8).max(72),
    confirmPassword: z.string().min(8).max(72),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Las claves no coinciden.',
        path: ['confirmPassword'],
      });
    }
  });

export const cycleSettlementProposalSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  maxCycles: z.number().int().positive().max(25).default(5),
});

export const cycleSettlementDecisionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  proposalId: uuidSchema,
});

export const cycleSettlementExecutionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  proposalId: uuidSchema,
});
