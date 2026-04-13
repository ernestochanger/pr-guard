import {
  compareSeverityDesc,
  highestSeverity,
  meetsSeverityThreshold,
  normalizedFindingSchema,
  type AIReviewerFinding,
  type NormalizedFinding,
  type ReviewerType,
  type Severity
} from "@pr-guard/shared";
import { createFindingFingerprint, normalizeFindingId } from "./fingerprint";
import type { ConsolidationResult, FindingDraft } from "./types";

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, 180);
}

function normalizeExplanation(explanation: string): string {
  return explanation.trim().replace(/\s+/g, " ").slice(0, 3000);
}

export function normalizeFindingDraft(draft: FindingDraft): NormalizedFinding | null {
  const normalized = {
    ...draft,
    title: normalizeTitle(draft.title),
    explanation: normalizeExplanation(draft.explanation),
    lineEnd: draft.lineEnd && draft.lineStart && draft.lineEnd < draft.lineStart ? draft.lineStart : draft.lineEnd,
    confidence: Math.max(0, Math.min(1, draft.confidence)),
    fingerprint: createFindingFingerprint(draft),
    id: ""
  };
  normalized.id = normalizeFindingId(normalized.fingerprint);

  const parsed = normalizedFindingSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export function normalizeAiFindings(
  reviewerType: Extract<ReviewerType, "QUALITY" | "SECURITY" | "ARCHITECTURE">,
  findings: AIReviewerFinding[]
): NormalizedFinding[] {
  return findings
    .map((finding) =>
      normalizeFindingDraft({
        reviewerType,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        explanation: finding.explanation,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        lineEnd: finding.lineEnd,
        confidence: finding.confidence,
        source: "ai"
      })
    )
    .filter((finding): finding is NormalizedFinding => Boolean(finding));
}

function duplicateKey(finding: NormalizedFinding): string {
  return [
    finding.filePath ?? "",
    finding.category,
    finding.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  ].join("|");
}

export function dedupeFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  const byKey = new Map<string, NormalizedFinding>();

  for (const finding of findings) {
    const exactKey = finding.fingerprint;
    const nearKey = duplicateKey(finding);
    const existing = byKey.get(exactKey) ?? byKey.get(nearKey);

    if (!existing) {
      byKey.set(exactKey, finding);
      byKey.set(nearKey, finding);
      continue;
    }

    const winner =
      compareSeverityDesc(finding.severity, existing.severity) < 0 ||
      (finding.severity === existing.severity && finding.confidence > existing.confidence)
        ? finding
        : existing;

    byKey.set(exactKey, winner);
    byKey.set(nearKey, winner);
  }

  return [...new Set(byKey.values())];
}

export function sortFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  return [...findings].sort((a, b) => {
    const severity = compareSeverityDesc(a.severity, b.severity);
    if (severity !== 0) {
      return severity;
    }
    return b.confidence - a.confidence;
  });
}

export function consolidateFindings(input: {
  deterministic: FindingDraft[];
  ai: NormalizedFinding[];
  minimumSeverity: Severity;
  maxSurfaced?: number;
}): ConsolidationResult {
  const deterministic = input.deterministic
    .map(normalizeFindingDraft)
    .filter((finding): finding is NormalizedFinding => Boolean(finding));

  const allFindings = sortFindings(dedupeFindings([...deterministic, ...input.ai]));
  const surfacedFindings = allFindings
    .filter((finding) => meetsSeverityThreshold(finding.severity, input.minimumSeverity))
    .slice(0, input.maxSurfaced ?? 15);

  return {
    allFindings,
    surfacedFindings,
    overallSeverity: highestSeverity(surfacedFindings.map((finding) => finding.severity))
  };
}
