import { describe, expect, it } from 'vitest';
import { createMoneyFormatter } from './format-money';

describe('exact scenario money formatting', () => {
  it('preserves cents at the largest allowed positive and negative amounts', () => {
    const money = createMoneyFormatter('USD');
    expect(money('99999999999999.99')).toBe('$99,999,999,999,999.99');
    expect(money('-99999999999999.99')).toBe('-$99,999,999,999,999.99');
    expect(money('-0.01')).toBe('-$0.01');
    expect(money('10.5')).toBe('$10.50');
    expect(money(null)).toBe('Unavailable');
  });
});
