import { describe, expect, it } from "vitest";
import { parseAIReviewerOutput } from "@pr-guard/ai";

describe("AI response parsing", () => {
  it("accepts strict JSON output", () => {
    const parsed = parseAIReviewerOutput(
      JSON.stringify({
        summary: "Looks good",
        findings: []
      })
    );

    expect(parsed.summary).toBe("Looks good");
    expect(parsed.findings).toEqual([]);
  });

  it("extracts fenced JSON and validates finding shape", () => {
    const parsed = parseAIReviewerOutput(`\`\`\`json
{
  "summary": "Security issue",
  "findings": [
    {
      "title": "Unsafe query",
      "category": "SECURITY",
      "severity": "HIGH",
      "explanation": "Interpolated SQL was added.",
      "filePath": "src/db.ts",
      "lineStart": 4,
      "lineEnd": 4,
      "confidence": 0.91
    }
  ]
}
\`\`\``);

    expect(parsed.findings[0]?.severity).toBe("HIGH");
  });

  it("rejects malformed findings", () => {
    expect(() =>
      parseAIReviewerOutput(
        JSON.stringify({
          summary: "bad",
          findings: [{ title: "", category: "NOPE", severity: "CRITICAL" }]
        })
      )
    ).toThrow();
  });
});
