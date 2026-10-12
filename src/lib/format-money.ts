/** Format server-calculated currency strings without a binary-float conversion. */
export function createMoneyFormatter(currency: string) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return (value: string | null): string => {
    if (value === null) return 'Unavailable';
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) throw new Error('Currency amounts must be decimal strings with at most two places.');
    const whole = BigInt(`${match[1]}${match[2]}`);
    // BigInt has no negative zero. Preserve the sign for amounts such as -0.01.
    const formattedWhole = match[1] && whole === 0n ? -0 : whole;
    const fraction = (match[3] ?? '').padEnd(2, '0');
    return formatter.formatToParts(formattedWhole).map((part) => part.type === 'fraction' ? fraction : part.value).join('');
  };
}
