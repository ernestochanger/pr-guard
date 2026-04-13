import { getRepositoryForUser, updateRepositorySettings } from "@pr-guard/db";
import { ok, fail } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await params;
    rateLimit(`settings:${user.id}:${id}`, 20, 60_000);
    await getRepositoryForUser(id, user.id, { requireAdmin: true });
    const body = await request.json();
    const settings = await updateRepositorySettings(id, body);
    return ok(serializeForJson({ settings }));
  } catch (error) {
    return fail(error);
  }
}
