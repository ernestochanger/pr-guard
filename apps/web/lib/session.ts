import { getServerSession } from "next-auth";
import { UnauthorizedError } from "@pr-guard/shared";
import { authOptions } from "./auth";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session.user;
}
