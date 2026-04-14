import type { AIProvider, AnalysisStatus, Prisma } from "@prisma/client";
import { prisma } from "./client";

export async function transitionAnalysis(input: {
  analysisId: string;
  attemptId?: string;
  status: AnalysisStatus;
  error?: string | null;
  summary?: string | null;
  totals?: {
    totalFindings?: number;
    surfacedFindings?: number;
    supportedFiles?: number;
    ignoredFiles?: number;
  };
  overallSeverity?: "LOW" | "MEDIUM" | "HIGH" | null;
}) {
  const now = new Date();
  const terminal = ["COMPLETED", "FAILED", "PARTIAL", "SKIPPED"].includes(input.status);

  return prisma.$transaction(async (tx) => {
    const analysis = await tx.pullRequestAnalysis.update({
      where: { id: input.analysisId },
      data: {
        status: input.status,
        error: input.error ?? null,
        summary: input.summary ?? undefined,
        overallSeverity: input.overallSeverity ?? undefined,
        startedAt: input.status === "RUNNING" ? now : undefined,
        completedAt: terminal ? now : undefined,
        totalFindings: input.totals?.totalFindings,
        surfacedFindings: input.totals?.surfacedFindings,
        supportedFiles: input.totals?.supportedFiles,
        ignoredFiles: input.totals?.ignoredFiles
      }
    });

    if (input.attemptId) {
      await tx.analysisAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: input.status,
          error: input.error ?? null,
          startedAt: input.status === "RUNNING" ? now : undefined,
          completedAt: terminal ? now : undefined
        }
      });
    }

    return analysis;
  });
}

export async function createAttemptForAnalysis(input: {
  repositoryId: string;
  pullRequestId: string;
  headSha: string;
  aiProvider?: AIProvider;
  minimumSeverity: "LOW" | "MEDIUM" | "HIGH";
  sourceEventType: "OPENED" | "REOPENED" | "SYNCHRONIZE" | "MANUAL_RERUN";
  createdByUserId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const pullRequest =
      input.aiProvider === undefined
        ? await tx.pullRequest.findUniqueOrThrow({
            where: { id: input.pullRequestId },
            select: { aiProvider: true }
          })
        : null;

    const analysis = await tx.pullRequestAnalysis.create({
      data: {
        repositoryId: input.repositoryId,
        pullRequestId: input.pullRequestId,
        headSha: input.headSha,
        aiProvider: input.aiProvider ?? pullRequest?.aiProvider ?? "OPENAI",
        minimumSeverity: input.minimumSeverity,
        sourceEventType: input.sourceEventType,
        createdByUserId: input.createdByUserId ?? null,
        status: "QUEUED"
      }
    });

    const attempt = await tx.analysisAttempt.create({
      data: {
        analysisId: analysis.id,
        attemptNumber: 1,
        status: "QUEUED",
        reason: input.sourceEventType
      }
    });

    return { analysis, attempt };
  });
}

export async function storeConsolidatedFindings(input: {
  analysisId: string;
  attemptId: string;
  findings: Array<{
    reviewerRunId?: string | null;
    reviewerType: "DETERMINISTIC" | "QUALITY" | "SECURITY" | "ARCHITECTURE";
    category: "QUALITY" | "SECURITY" | "ARCHITECTURE" | "MAINTAINABILITY" | "RELIABILITY" | "TESTING";
    severity: "LOW" | "MEDIUM" | "HIGH";
    title: string;
    explanation: string;
    filePath: string | null;
    lineStart: number | null;
    lineEnd: number | null;
    confidence: number;
    fingerprint: string;
    surfaced: boolean;
    raw?: Prisma.InputJsonValue;
  }>;
}) {
  await prisma.finding.deleteMany({ where: { analysisId: input.analysisId } });

  if (input.findings.length === 0) {
    return [];
  }

  return prisma.$transaction(
    input.findings.map((finding) =>
      prisma.finding.create({
        data: {
          analysisId: input.analysisId,
          attemptId: input.attemptId,
          reviewerRunId: finding.reviewerRunId ?? null,
          reviewerType: finding.reviewerType,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          explanation: finding.explanation,
          filePath: finding.filePath,
          lineStart: finding.lineStart,
          lineEnd: finding.lineEnd,
          confidence: finding.confidence,
          fingerprint: finding.fingerprint,
          surfaced: finding.surfaced,
          raw: finding.raw
        }
      })
    )
  );
}
