import { describe, expect, it } from 'vitest';

import { DomainError } from '../common/domain-error';
import { Money } from './money';

describe('Money', () => {
  it('uses safe integer minor units only', () => {
    expect(() => new Money(12.5)).toThrow(DomainError);
  });

  it('adds values in the same currency', () => {
    expect(new Money(100).add(new Money(40)).amountMinor).toBe(140);
  });
});
