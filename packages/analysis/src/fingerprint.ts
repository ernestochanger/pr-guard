import crypto from "node:crypto";
import type { FindingDraft } from "./types";

export function createFindingFingerprint(finding: Omit<FindingDraft, "confidence">): string {
  const stable = [
    finding.reviewerType,
    finding.category,
    finding.severity,
    finding.filePath ?? "",
    finding.lineStart ?? "",
    finding.title.toLowerCase().replace(/\s+/g, " ").trim()
  ].join("|");

  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export function normalizeFindingId(fingerprint: string): string {
  return `finding_${fingerprint.slice(0, 16)}`;
}
