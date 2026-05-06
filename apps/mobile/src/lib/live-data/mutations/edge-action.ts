import { createIdempotencyKey } from '../../idempotency';
import { invokeSupabaseFunction } from '../client';

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

export async function invokeParsedEdgeFunction<
  TPayload extends Record<string, unknown>,
  TResult,
>(
  name: string,
  schema: EdgePayloadSchema<TPayload>,
  input: unknown,
): Promise<TResult> {
  const payload = parseEdgePayload(schema, input);

  return invokeSupabaseFunction<TPayload, TResult>(name, payload);
}
