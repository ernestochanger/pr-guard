import { assertUserCanManageAppSettings, updateAppSettings } from "@pr-guard/db";
import { ok, fail } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    assertSameOrigin(request);
    rateLimit(`app-settings:${user.id}`, 20, 60_000);
    await assertUserCanManageAppSettings(user.id);
    const body = await request.json();
    const settings = await updateAppSettings(body);
    return ok(serializeForJson({ settings }));
  } catch (error) {
    return fail(error);
  }
}
