import type { ReviewerType } from "@pr-guard/shared";

type AIReviewerType = Extract<ReviewerType, "QUALITY" | "SECURITY" | "ARCHITECTURE">;

const baseRules = [
  "Analyze only the provided pull request diff context.",
  "Return only valid JSON matching the schema. Do not wrap the JSON in markdown.",
  "Do not invent files, line numbers, dependencies, behavior, or runtime context not present in the diff.",
  "Prefer no finding over generic advice.",
  "Findings must be actionable, concise, and tied to changed code.",
  "Avoid duplicating deterministic findings such as obvious console logging, hardcoded secrets, eval, broad catch/pass, SQL interpolation, and insecure HTTP unless the AI adds materially new context."
].join("\n");

const reviewerInstructions: Record<AIReviewerType, string> = {
  QUALITY:
    "You are the AI Quality Reviewer. Focus on correctness, reliability, testability, maintainability, and risky edge cases introduced by the changed code.",
  SECURITY:
    "You are the AI Security Reviewer. Focus on auth, authorization, injection, secret handling, unsafe IO, data exposure, SSRF, XSS, and privilege boundaries visible in the diff.",
  ARCHITECTURE:
    "You are the AI Architecture Reviewer. Focus on module boundaries, layering, coupling, dependency direction, API contract drift, and design choices visible in the changed code."
};

export function buildSystemPrompt(reviewerType: AIReviewerType): string {
  return `${reviewerInstructions[reviewerType]}\n\n${baseRules}`;
}

export function buildUserPrompt(input: {
  reviewerType: AIReviewerType;
  diffContext: string;
  deterministicFindingSummaries: string[];
}): string {
  const duplicateContext =
    input.deterministicFindingSummaries.length > 0
      ? input.deterministicFindingSummaries.map((finding) => `- ${finding}`).join("\n")
      : "No deterministic findings were produced.";

  return [
    "Review this PR diff and return JSON in exactly this shape:",
    "{",
    '  "summary": "brief reviewer-specific summary",',
    '  "findings": [',
    "    {",
    '      "title": "specific title",',
    '      "category": "QUALITY | SECURITY | ARCHITECTURE",',
    '      "severity": "LOW | MEDIUM | HIGH",',
    '      "explanation": "why this matters and what should change",',
    '      "filePath": "path from diff or null",',
    '      "lineStart": 123 or null,',
    '      "lineEnd": 123 or null,',
    '      "confidence": 0.0 to 1.0',
    "    }",
    "  ]",
    "}",
    "",
    "Known deterministic findings to avoid duplicating:",
    duplicateContext,
    "",
    "Diff context:",
    input.diffContext
  ].join("\n");
}
