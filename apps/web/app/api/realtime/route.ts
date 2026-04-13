import { prisma } from "@pr-guard/db";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let lastSeen = new Date(Date.now() - 1000);

        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(serializeForJson(data))}\n\n`)
          );
        };

        request.signal.addEventListener(
          "abort",
          () => {
            closed = true;
            controller.close();
          },
          { once: true }
        );

        send("ready", { connected: true, timestamp: new Date().toISOString() });

        while (!closed) {
          const memberships = await prisma.repositoryMembership.findMany({
            where: { userId: user.id },
            select: { repositoryId: true }
          });
          const repositoryIds = memberships.map((membership) => membership.repositoryId);
          const events = await prisma.realtimeEvent.findMany({
            where: {
              createdAt: { gt: lastSeen },
              OR: [
                { userId: user.id },
                { repositoryId: { in: repositoryIds } },
                { userId: null, repositoryId: null }
              ]
            },
            orderBy: { createdAt: "asc" },
            take: 50
          });

          for (const event of events) {
            lastSeen = event.createdAt;
            send(event.type, event);
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
          send("heartbeat", { timestamp: new Date().toISOString() });
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    return fail(error);
  }
}
