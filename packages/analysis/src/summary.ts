import {
  managedCommentMarker,
  type AIProvider,
  type AnalysisStatus,
  type NormalizedFinding,
  type Severity
} from "@pr-guard/shared";

function severityCounts(findings: NormalizedFinding[]): Record<Severity, number> {
  return {
    HIGH: findings.filter((finding) => finding.severity === "HIGH").length,
    MEDIUM: findings.filter((finding) => finding.severity === "MEDIUM").length,
    LOW: findings.filter((finding) => finding.severity === "LOW").length
  };
}

function recommendation(overallSeverity: Severity | null, partial: boolean): string {
  if (partial) {
    return "Review with care: at least one reviewer failed, so this is a partial first pass.";
  }
  if (overallSeverity === "HIGH") {
    return "Human reviewers should resolve the high-severity items before approving.";
  }
  if (overallSeverity === "MEDIUM") {
    return "Human reviewers should check the medium-severity items before approving.";
  }
  if (overallSeverity === "LOW") {
    return "Only low-severity items were surfaced. Human review is still required.";
  }
  return "No surfaced findings met the configured threshold. Human review is still required.";
}

export function buildPrSummaryMarkdown(input: {
  status: AnalysisStatus;
  provider: AIProvider;
  findings: NormalizedFinding[];
  allFindingsCount: number;
  overallSeverity: Severity | null;
  partial: boolean;
  reviewerFailures: string[];
  supportedFiles: number;
  ignoredFiles: number;
  truncated: boolean;
}): string {
  const counts = severityCounts(input.findings);
  const statusText = input.partial ? "Partial" : input.status;
  const lines = [
    "## PR Guard Review",
    "",
    `**Status:** ${statusText}`,
    `**AI provider:** ${input.provider}`,
    `**Supported files analyzed:** ${input.supportedFiles}`,
    `**Unsupported or skipped files:** ${input.ignoredFiles}`,
    `**Severity summary:** ${counts.HIGH} high, ${counts.MEDIUM} medium, ${counts.LOW} low`,
    `**Recommendation:** ${recommendation(input.overallSeverity, input.partial)}`,
    ""
  ];

  if (input.truncated) {
    lines.push("> Large diff handling was applied, so the review prioritized the earliest supported patch content.");
    lines.push("");
  }

  if (input.reviewerFailures.length > 0) {
    lines.push(`> Partial result: ${input.reviewerFailures.join(", ")} failed.`);
    lines.push("");
  }

  if (input.findings.length === 0) {
    lines.push("No findings met the configured severity threshold.");
  } else {
    lines.push("### Top Findings");
    input.findings.forEach((finding, index) => {
      const location =
        finding.filePath && finding.lineStart
          ? `${finding.filePath}:${finding.lineStart}`
          : finding.filePath ?? "General";
      lines.push(
        `${index + 1}. **[${finding.severity}] ${finding.title}** (${finding.reviewerType}, ${finding.category})`
      );
      lines.push(`   - Location: ${location}`);
      lines.push(`   - ${finding.explanation}`);
    });
  }

  lines.push("");
  lines.push(`_PR Guard stores ${input.allFindingsCount} normalized finding(s) for dashboard history._`);
  return lines.join("\n").replace(managedCommentMarker, "");
}
