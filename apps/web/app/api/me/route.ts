import { ok, fail } from "@/lib/api";
import { getCurrentSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getCurrentSession();
    return ok({ user: session?.user ?? null });
  } catch (error) {
    return fail(error);
  }
}
