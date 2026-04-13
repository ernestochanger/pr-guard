export const repositoryConnectionStatuses = [
  "CONNECTED",
  "DISCONNECTED",
  "INSTALLATION_REVOKED",
  "SUSPENDED"
] as const;

export const analysisStatuses = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "PARTIAL",
  "SKIPPED"
] as const;

export const reviewerTypes = ["DETERMINISTIC", "QUALITY", "SECURITY", "ARCHITECTURE"] as const;

export const severities = ["LOW", "MEDIUM", "HIGH"] as const;

export const findingCategories = [
  "QUALITY",
  "SECURITY",
  "ARCHITECTURE",
  "MAINTAINABILITY",
  "RELIABILITY",
  "TESTING"
] as const;

export const aiProviders = ["OPENAI", "GOOGLE"] as const;

export const pullRequestEventTypes = ["OPENED", "REOPENED", "SYNCHRONIZE", "MANUAL_RERUN"] as const;

export const commentPublishStatuses = ["PENDING", "PUBLISHED", "UPDATED", "FAILED", "SKIPPED"] as const;

export const reviewerRunStatuses = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"] as const;

export const realtimeEventTypes = [
  "repository.updated",
  "webhook.received",
  "analysis.created",
  "analysis.updated",
  "findings.updated",
  "comment.updated",
  "rerun.updated"
] as const;

export type RepositoryConnectionStatus = (typeof repositoryConnectionStatuses)[number];
export type AnalysisStatus = (typeof analysisStatuses)[number];
export type ReviewerType = (typeof reviewerTypes)[number];
export type Severity = (typeof severities)[number];
export type FindingCategory = (typeof findingCategories)[number];
export type AIProvider = (typeof aiProviders)[number];
export type PullRequestEventType = (typeof pullRequestEventTypes)[number];
export type CommentPublishStatus = (typeof commentPublishStatuses)[number];
export type ReviewerRunStatus = (typeof reviewerRunStatuses)[number];
export type RealtimeEventType = (typeof realtimeEventTypes)[number];

export const severityRank: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

export function compareSeverityDesc(a: Severity, b: Severity): number {
  return severityRank[b] - severityRank[a];
}

export function meetsSeverityThreshold(severity: Severity, threshold: Severity): boolean {
  return severityRank[severity] >= severityRank[threshold];
}

export function highestSeverity(severityValues: Severity[]): Severity | null {
  if (severityValues.length === 0) {
    return null;
  }

  return severityValues.reduce((highest, value) =>
    severityRank[value] > severityRank[highest] ? value : highest
  );
}
