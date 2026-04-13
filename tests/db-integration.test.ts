import { describe, expect, it } from "vitest";
import { prisma, transitionAnalysis } from "@pr-guard/db";

const runDbTests = process.env.RUN_DB_TESTS === "true";

describe.skipIf(!runDbTests)("database-backed analysis transitions", () => {
  it("updates analysis and attempt status together", async () => {
    const installation = await prisma.gitHubInstallation.create({
      data: { githubInstallationId: BigInt(Date.now()), accountLogin: "test" }
    });
    const repository = await prisma.repository.create({
      data: {
        githubRepositoryId: BigInt(Date.now() + 1),
        installationId: installation.id,
        owner: "owner",
        name: "repo",
        fullName: "owner/repo",
        htmlUrl: "https://github.test/owner/repo"
      }
    });
    const pullRequest = await prisma.pullRequest.create({
      data: {
        repositoryId: repository.id,
        number: 1,
        title: "PR",
        headSha: "abc",
        htmlUrl: "https://github.test/owner/repo/pull/1"
      }
    });
    const analysis = await prisma.pullRequestAnalysis.create({
      data: {
        repositoryId: repository.id,
        pullRequestId: pullRequest.id,
        headSha: "abc",
        sourceEventType: "OPENED",
        aiProvider: "OPENAI",
        minimumSeverity: "MEDIUM"
      }
    });
    const attempt = await prisma.analysisAttempt.create({
      data: { analysisId: analysis.id, attemptNumber: 1, reason: "OPENED" }
    });

    await transitionAnalysis({
      analysisId: analysis.id,
      attemptId: attempt.id,
      status: "COMPLETED",
      totals: { totalFindings: 0, surfacedFindings: 0 }
    });

    const updated = await prisma.pullRequestAnalysis.findUniqueOrThrow({
      where: { id: analysis.id },
      include: { attempts: true }
    });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.attempts[0]?.status).toBe("COMPLETED");
  });
});
