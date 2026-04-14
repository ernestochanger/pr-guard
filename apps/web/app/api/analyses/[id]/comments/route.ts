import {
  getAnalysisForUser,
  getRepositoryForUser,
  prisma
} from "@pr-guard/db";
import { createInstallationOctokit, createPullRequestComment } from "@pr-guard/github";
import { AppError, ForbiddenError, manualPullRequestCommentSchema } from "@pr-guard/shared";
import { ok, fail } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { toPrismaJson } from "@/lib/json";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { serializeForJson } from "@/lib/serialize";

function explicitlyLacksIssueCommentPermission(permissions: unknown): boolean {
  return (
    typeof permissions === "object" &&
    permissions !== null &&
    "issues" in permissions &&
    (permissions as { issues?: unknown }).issues !== "write"
  );
}

function isGitHubForbidden(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 403
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    assertSameOrigin(request);
    const { id } = await params;
    rateLimit(`manual-comment:${user.id}:${id}`, 10, 60_000);

    const parsed = manualPullRequestCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError("Comment body is required.", 400, "INVALID_COMMENT");
    }
    const input = parsed.data;
    const analysis = await getAnalysisForUser(id, user.id);
    const repository = await getRepositoryForUser(analysis.repositoryId, user.id, {
      requireAdmin: true
    });

    if (repository.connectionStatus !== "CONNECTED") {
      throw new Error("Repository is not connected.");
    }

    const repositoryWithInstallation = await prisma.repository.findUniqueOrThrow({
      where: { id: repository.id },
      include: { installation: true }
    });
    if (
      explicitlyLacksIssueCommentPermission(repositoryWithInstallation.installation.permissions)
    ) {
      throw new ForbiddenError(
        "GitHub App permission is missing: enable Issues read and write, then re-approve the installation."
      );
    }

    const octokit = await createInstallationOctokit(
      repositoryWithInstallation.installation.githubInstallationId
    );
    let result;
    try {
      result = await createPullRequestComment({
        octokit,
        fullName: repositoryWithInstallation.fullName,
        pullNumber: analysis.pullRequest.number,
        body: input.body
      });
    } catch (error) {
      if (isGitHubForbidden(error)) {
        throw new ForbiddenError(
          "GitHub rejected the comment. Enable Issues read and write for the GitHub App, then re-approve the installation."
        );
      }
      throw error;
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        repositoryId: repository.id,
        action: "manual_pr_comment.created",
        metadata: toPrismaJson({
          analysisId: analysis.id,
          pullRequestId: analysis.pullRequestId,
          pullNumber: analysis.pullRequest.number,
          githubCommentId: result.commentId,
          githubCommentUrl: result.htmlUrl
        })
      }
    });

    return ok(serializeForJson(result));
  } catch (error) {
    return fail(error);
  }
}
