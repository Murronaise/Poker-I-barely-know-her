/**
 * Formats a currency value in GBP (Sterling) with exactly 2 decimal places.
 * e.g., 10 => £10.00, 10.1 => £10.10, -10.1 => -£10.10
 */
export function formatCurrency(amount: number, showSign: boolean = false): string {
  const absolute = Math.abs(amount);
  const formatted = absolute.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  if (amount >= 0) {
    return `${showSign ? "+" : ""}£${formatted}`;
  } else {
    return `-£${formatted}`;
  }
}
