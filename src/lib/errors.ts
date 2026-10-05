/** An error whose message is safe and helpful to show to the user. */
export class UserError extends Error {
  readonly isUserError = true;
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function isUserError(e: unknown): e is UserError {
  return Boolean(e && typeof e === "object" && (e as { isUserError?: boolean }).isUserError);
}
