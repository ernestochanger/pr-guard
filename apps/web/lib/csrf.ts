import { ForbiddenError, getAppUrlEnv } from "@pr-guard/shared";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  const expected = new URL(getAppUrlEnv().APP_URL).origin;
  if (new URL(origin).origin !== expected) {
    throw new ForbiddenError("Invalid request origin.");
  }
}
