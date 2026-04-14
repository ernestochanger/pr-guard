import { describe, expect, it } from "vitest";
import { appSettingsSchema, repositorySettingsSchema } from "@pr-guard/shared";

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
