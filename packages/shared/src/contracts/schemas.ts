import { z } from 'zod';

import {
  ACCOUNT_KINDS,
  AUDIT_ENTITY_TYPES,
  AUDIT_EVENT_NAMES,
  CURRENCY_CODE,
  ENTRY_SIDES,
  PARTICIPANT_DECISIONS,
  PROPOSAL_STATUSES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  TRANSACTION_SOURCE_TYPES,
  TRANSACTION_TYPES,
} from './enums';

export const uuidSchema = z.string().uuid();
export const idempotencyKeySchema = z.string().min(8).max(128);
export const moneyMinorSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const requestTypeSchema = z.enum(REQUEST_TYPES);
export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const transactionSourceTypeSchema = z.enum(TRANSACTION_SOURCE_TYPES);
export const accountKindSchema = z.enum(ACCOUNT_KINDS);
export const entrySideSchema = z.enum(ENTRY_SIDES);
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);
export const participantDecisionSchema = z.enum(PARTICIPANT_DECISIONS);
export const auditEntityTypeSchema = z.enum(AUDIT_ENTITY_TYPES);
export const auditEventNameSchema = z.enum(AUDIT_EVENT_NAMES);

export const createBalanceRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  responderUserId: uuidSchema,
  debtorUserId: uuidSchema,
  creditorUserId: uuidSchema,
  amountMinor: moneyMinorSchema,
  description: z.string().trim().min(1).max(240),
  currencyCode: z.literal(CURRENCY_CODE).default(CURRENCY_CODE),
  requestKind: z.literal('balance_increase'),
});

export const amendFinancialRequestSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  requestId: uuidSchema,
  amountMinor: moneyMinorSchema,
  description: z.string().trim().min(1).max(240),
});

export const requestDecisionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  requestId: uuidSchema,
});

export const relationshipInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  inviteeUserId: uuidSchema,
});

export const relationshipInviteDecisionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  inviteId: uuidSchema,
});

export const emailPasswordSignInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

export const registrationSchema = emailPasswordSignInSchema
  .extend({
    fullName: z.string().trim().min(3).max(120),
    confirmPassword: z.string().min(8).max(72),
    phoneCountryIso2: z.string().trim().length(2),
    phoneCountryCallingCode: z.string().trim().min(2).max(6),
    phoneNationalNumber: z.string().trim().min(6).max(20),
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
  phoneCountryIso2: z.string().trim().length(2),
  phoneCountryCallingCode: z.string().trim().min(2).max(6),
  phoneNationalNumber: z.string().trim().min(6).max(20),
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

export const createContactInviteSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  inviteeName: z.string().trim().min(2).max(120),
  phoneCountryIso2: z.string().trim().length(2),
  phoneCountryCallingCode: z.string().trim().min(2).max(6),
  phoneNationalNumber: z.string().trim().min(6).max(20),
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
