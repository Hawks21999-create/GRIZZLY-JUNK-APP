/** Normalize a US phone number to 10 digits, or null when it can't be. */
export function phoneDigits(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : d.length >= 7 ? d : null;
}

export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const d = phoneDigits(input);
  if (d && d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return input;
}

/** tel:/sms: friendly E.164-ish string */
export function dialable(input: string | null | undefined): string {
  const d = phoneDigits(input);
  if (!d) return "";
  return d.length === 10 ? `+1${d}` : d;
}
