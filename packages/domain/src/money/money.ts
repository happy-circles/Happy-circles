import { CURRENCY_CODE, type CurrencyCode } from '@happy-circles/shared';

import { DomainError } from '../common/domain-error';

export type MoneyMinor = number & { readonly __brand: 'MoneyMinor' };

export function toMoneyMinor(value: number): MoneyMinor {
  if (!Number.isSafeInteger(value)) {
    throw new DomainError('money.invalid_minor_units', 'Money must use safe integer minor units.');
  }

  return value as MoneyMinor;
}

export class Money {
  public readonly amountMinor: MoneyMinor;
  public readonly currencyCode: CurrencyCode;

  public constructor(amountMinor: number, currencyCode: CurrencyCode = CURRENCY_CODE) {
    this.amountMinor = toMoneyMinor(amountMinor);
    this.currencyCode = currencyCode;
  }

  public add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currencyCode);
  }

  public subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currencyCode);
  }

  public negate(): Money {
    return new Money(-(this.amountMinor as number), this.currencyCode);
  }

  public isPositive(): boolean {
    return this.amountMinor > 0;
  }

  public isZero(): boolean {
    return this.amountMinor === 0;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currencyCode !== other.currencyCode) {
      throw new DomainError('money.currency_mismatch', 'Cannot combine values with different currencies.');
    }
  }
}
