/**
 * Money helpers. All amounts are integer cents. There is no currency setting in
 * this app: every amount is rendered with a leading "$".
 */

export type MinorUnits = number;

export const CENTS_PER_DOLLAR = 100;

/** Format as dollars with two decimals, e.g. 123456 -> "$1,234.56". */
export function formatMoney(minor: MinorUnits): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR);
  const cents = abs % CENTS_PER_DOLLAR;
  return `${sign}$${dollars.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}

/** Format a whole-dollar amount with no decimals, e.g. 123500 -> "$1,235". */
export function formatMoneyWhole(minor: MinorUnits): string {
  const sign = minor < 0 ? "-" : "";
  const dollars = Math.round(Math.abs(minor) / CENTS_PER_DOLLAR);
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}

/**
 * Parse user input into cents. Returns null when the input is not a valid
 * positive amount. Rejects anything with more than two decimal places.
 */
export function parseMoneyToMinor(input: string): MinorUnits | null {
  const trimmed = input.trim().replace(/[$,\s]/g, "");
  if (trimmed === "") return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;

  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > 2) return null;
  if (whole === "" && frac === "") return null;

  const value = Number(`${whole || "0"}.${frac.padEnd(2, "0")}`);
  if (!Number.isFinite(value)) return null;

  const minor = Math.round(value * CENTS_PER_DOLLAR);
  return minor > 0 ? minor : null;
}

/** Round UP to a whole dollar. 40 -> 100, 100 -> 100, 0 -> 0. */
export function ceilWholeDollars(minor: MinorUnits): MinorUnits {
  return Math.ceil(minor / CENTS_PER_DOLLAR) * CENTS_PER_DOLLAR;
}

/**
 * Round DOWN to a whole dollar, i.e. reduce the magnitude.
 * 4060 -> 4000, -4060 -> -4000, 4000 -> 4000, 0 -> 0.
 *
 * The sign is preserved before flooring. Math.floor(-40.6) is -41, which would
 * round *away* from zero and make the account reimburse MORE than it owes, so
 * the magnitude is floored and the sign reapplied.
 */
export function floorWholeDollars(minor: MinorUnits): MinorUnits {
  const sign = minor < 0 ? -1 : 1;
  const result = sign * Math.floor(Math.abs(minor) / CENTS_PER_DOLLAR) * CENTS_PER_DOLLAR;
  // Normalise -0 to 0 so equality checks and display never see negative zero.
  return result === 0 ? 0 : result;
}
