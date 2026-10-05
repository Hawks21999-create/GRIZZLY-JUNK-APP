import "server-only";
import bcrypt from "bcryptjs";

const ROUNDS = 12;
// Used to keep timing similar when the email doesn't exist.
const DUMMY_HASH = "$2b$12$YHcYIJHA6E9flmlPqz3BqOnD4gdewDAq7SwG3jzdUXKVgv0xT1a56";

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, ROUNDS);
}

export async function verifyPassword(pw: string, hash: string | null | undefined) {
  if (!hash) {
    await bcrypt.compare(pw, DUMMY_HASH).catch(() => false);
    return false;
  }
  return bcrypt.compare(pw, hash);
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 200) return "Password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}
