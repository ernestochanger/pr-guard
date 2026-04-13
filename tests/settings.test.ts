import { describe, expect, it } from "vitest";
import { repositorySettingsSchema } from "@pr-guard/shared";

describe("repository settings validation", () => {
  it("requires at least one reviewer", () => {
    expect(() =>
      repositorySettingsSchema.parse({
        qualityEnabled: false,
        securityEnabled: false,
        architectureEnabled: false,
        minimumSeverity: "MEDIUM",
        aiProvider: "OPENAI"
      })
    ).toThrow();
  });

  it("accepts provider and threshold settings", () => {
    const settings = repositorySettingsSchema.parse({
      qualityEnabled: true,
      securityEnabled: false,
      architectureEnabled: true,
      minimumSeverity: "HIGH",
      aiProvider: "GOOGLE"
    });

    expect(settings.aiProvider).toBe("GOOGLE");
    expect(settings.minimumSeverity).toBe("HIGH");
  });
});
