import { getAnalysisForUser } from "@pr-guard/db";
import { ok, fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const analysis = await getAnalysisForUser(id, user.id);
    return ok(serializeForJson({ analysis }));
  } catch (error) {
    return fail(error);
  }
}
