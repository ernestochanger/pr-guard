import { describe, expect, it } from "vitest";
import {
  appSettingsSchema,
  manualPullRequestCommentSchema,
  repositorySettingsSchema
} from "@pr-guard/shared";

describe("repository settings validation", () => {
  it("requires at least one reviewer", () => {
    expect(() =>
      repositorySettingsSchema.parse({
        qualityEnabled: false,
        securityEnabled: false,
        architectureEnabled: false,
        minimumSeverity: "MEDIUM"
      })
    ).toThrow();
  });

  it("accepts reviewer and threshold settings", () => {
    const settings = repositorySettingsSchema.parse({
      qualityEnabled: true,
      securityEnabled: false,
      architectureEnabled: true,
      minimumSeverity: "HIGH"
    });

    expect(settings.minimumSeverity).toBe("HIGH");
  });

  it("rejects repository-level provider settings", () => {
    expect(() =>
      repositorySettingsSchema.parse({
        qualityEnabled: true,
        securityEnabled: true,
        architectureEnabled: true,
        minimumSeverity: "MEDIUM",
        aiProvider: "CLAUDE"
      })
    ).toThrow();
  });

  it("accepts app default provider settings", () => {
    const settings = appSettingsSchema.parse({
      defaultAiProvider: "CLAUDE"
    });

    expect(settings.defaultAiProvider).toBe("CLAUDE");
  });
});

describe("manual pull request comment validation", () => {
  it("accepts and trims valid comment text", () => {
    const input = manualPullRequestCommentSchema.parse({
      body: "  Looks good after the follow-up fix.  "
    });

    expect(input.body).toBe("Looks good after the follow-up fix.");
  });

  it("rejects empty comment text", () => {
    expect(() => manualPullRequestCommentSchema.parse({ body: "   " })).toThrow();
  });

  it("rejects over-limit comment text", () => {
    expect(() =>
      manualPullRequestCommentSchema.parse({ body: "a".repeat(65_001) })
    ).toThrow();
  });
});
