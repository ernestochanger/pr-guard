import { describe, expect, it } from "vitest";
import {
  buildPrSummaryMarkdown,
  consolidateFindings,
  normalizeAiFindings,
  normalizeDiffContext,
  runDeterministicRules
} from "@pr-guard/analysis";

describe("analysis normalization and deterministic rules", () => {
  it("filters unsupported files and parses changed JS lines", () => {
    const context = normalizeDiffContext(
      [
        {
          filename: "src/app.ts",
          status: "modified",
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: "@@ -1,1 +1,2 @@\n const ok = true\n+console.log('debug')"
        },
        {
          filename: "README.md",
          status: "modified",
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: "@@ -1,1 +1,2 @@\n text\n+more"
        }
      ],
      { maxFiles: 10, maxPatchChars: 1000 }
    );

    expect(context.supportedFiles).toBe(1);
    expect(context.ignoredFiles).toBe(1);
    expect(context.files[0]?.lines.some((line) => line.type === "add" && line.newLine === 2)).toBe(true);
  });

  it("finds high-signal deterministic findings", () => {
    const context = normalizeDiffContext(
      [
        {
          filename: "src/auth.ts",
          status: "modified",
          additions: 4,
          deletions: 0,
          changes: 4,
          patch:
            "@@ -1,1 +1,5 @@\n export const ok = true\n+const apiKey = 'abcdefghijklmnopqrstuvwxyz123456'\n+const auth = false\n+eval(userInput)\n+const q = `SELECT * FROM users WHERE id = ${userId}`"
        }
      ],
      { maxFiles: 10, maxPatchChars: 2000 }
    );

    const findings = runDeterministicRules(context);
    expect(findings.map((finding) => finding.source)).toEqual(
      expect.arrayContaining([
        "hardcoded-secret",
        "disabled-auth",
        "dangerous-eval-exec",
        "sql-interpolation"
      ])
    );
  });
});

describe("finding consolidation", () => {
  it("deduplicates and applies severity threshold only to surfaced findings", () => {
    const aiFindings = normalizeAiFindings("SECURITY", [
      {
        title: "Potential hardcoded secret",
        category: "SECURITY",
        severity: "HIGH",
        explanation: "The same issue was also spotted by AI.",
        filePath: "src/auth.ts",
        lineStart: 2,
        lineEnd: 2,
        confidence: 0.7
      },
      {
        title: "Missing edge-case handling",
        category: "QUALITY",
        severity: "LOW",
        explanation: "A low severity quality note.",
        filePath: "src/auth.ts",
        lineStart: 8,
        lineEnd: 8,
        confidence: 0.5
      }
    ]);

    const result = consolidateFindings({
      deterministic: [
        {
          reviewerType: "DETERMINISTIC",
          category: "SECURITY",
          severity: "HIGH",
          title: "Potential hardcoded secret",
          explanation: "Secret appears in source.",
          filePath: "src/auth.ts",
          lineStart: 2,
          lineEnd: 2,
          confidence: 0.9,
          source: "hardcoded-secret"
        }
      ],
      ai: aiFindings,
      minimumSeverity: "MEDIUM"
    });

    expect(result.allFindings.length).toBe(2);
    expect(result.surfacedFindings.length).toBe(1);
    expect(result.overallSeverity).toBe("HIGH");
  });

  it("builds concise managed PR summary markdown", () => {
    const summary = buildPrSummaryMarkdown({
      status: "COMPLETED",
      provider: "OPENAI",
      findings: [],
      allFindingsCount: 0,
      overallSeverity: null,
      partial: false,
      reviewerFailures: [],
      supportedFiles: 1,
      ignoredFiles: 0,
      truncated: false
    });

    expect(summary).toContain("PR Guard Review");
    expect(summary).toContain("No findings met");
    expect(summary).not.toContain("pr-guard:managed-comment");
  });
});
