// Display-only formatting. Financial values are calculated by the API and arrive as decimal strings.
export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function createFormatters(currencyCode: string) {
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, minimumFractionDigits: 2 });
  const number = new Intl.NumberFormat('en-US');
  return {
    currency,
    number,
    amount: (value: string | null) => (value === null ? 'Unavailable' : currency.format(Number(value))),
    percentage: (value: string | null) => (value === null ? 'Unavailable' : `${number.format(Number(value))}%`),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;
