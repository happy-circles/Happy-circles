import { createIdempotencyKey } from '../../idempotency';
import { RetriableActionRegistry } from '../../retriable-action';
import {
  assertSupabaseClient,
  invokeSupabaseFunction,
  type InvokeSupabaseFunctionOptions,
} from '../client';

const invitationIntentions = new RetriableActionRegistry();

export function forgetInvitationIntentions(
  userId: string,
  target: {
    readonly phoneE164?: string;
    readonly matchedUserId?: string | null;
    readonly inviteId?: string | null;
  },
) {
  invitationIntentions.forgetWhere((signature) => {
    const [actor, , input] = JSON.parse(signature) as [string, string, Record<string, unknown>];
    return (
      actor === userId &&
      Boolean(
        (target.phoneE164 && input.intendedRecipientPhoneE164 === target.phoneE164) ||
        (target.matchedUserId && input.targetUserId === target.matchedUserId) ||
        (target.inviteId && input.inviteId === target.inviteId),
      )
    );
  });
}

export interface EdgePayloadSchema<TPayload extends Record<string, unknown>> {
  parse(input: unknown): TPayload;
}

export function withIdempotencyKey<TInput extends Record<string, unknown>>(
  prefix: string,
  input: TInput,
): TInput & { readonly idempotencyKey: string } {
  return {
    ...input,
    idempotencyKey: createIdempotencyKey(prefix),
  };
}

export function parseEdgePayload<TPayload extends Record<string, unknown>>(
  schema: EdgePayloadSchema<TPayload>,
  input: unknown,
): TPayload {
  return schema.parse(input);
}

export async function invokeParsedEdgeFunction<TPayload extends Record<string, unknown>, TResult>(
  name: string,
  schema: EdgePayloadSchema<TPayload>,
  input: unknown,
  options?: InvokeSupabaseFunctionOptions,
): Promise<TResult> {
  const payload = parseEdgePayload(schema, input);

  if (
    typeof payload.idempotencyKey === 'string' &&
    (name.includes('friendship-invite') ||
      name === 'create-people-outreach' ||
      name === 'cancel-account-invite' ||
      name === 'review-account-invite')
  ) {
    const { data } = await assertSupabaseClient().auth.getSession();
    if (!data.session) throw new Error('Inicia sesión para continuar.');
    const actorId = data.session.user.id;
    if (options?.expectedUserId !== undefined && options.expectedUserId !== actorId) {
      throw new Error('La sesión cambió. Vuelve a intentar la acción.');
    }
    const intent: Record<string, unknown> = { ...payload };
    delete intent.idempotencyKey;
    const signature = JSON.stringify([actorId, name, intent]);
    return invitationIntentions.run(signature, name, (idempotencyKey) =>
      invokeSupabaseFunction<TPayload, TResult>(
        name,
        { ...payload, idempotencyKey },
        { ...options, expectedUserId: options?.expectedUserId ?? actorId },
      ),
    );
  }

  return options
    ? invokeSupabaseFunction<TPayload, TResult>(name, payload, options)
    : invokeSupabaseFunction<TPayload, TResult>(name, payload);
}
