import { beforeAll, describe, expect, it } from "vitest";
import { generateStructuredReview } from "@pr-guard/ai";
import type { AIProvider } from "@pr-guard/shared";

const requiredEnv = {
  APP_URL: "http://localhost:3000",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: "test-secret-at-least-16-chars",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/pr_guard",
  REDIS_URL: "redis://localhost:6379",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  GITHUB_APP_ID: "12345",
  GITHUB_APP_CLIENT_ID: "github-app-client-id",
  GITHUB_APP_CLIENT_SECRET: "github-app-client-secret",
  GITHUB_WEBHOOK_SECRET: "github-webhook-secret",
  GITHUB_PRIVATE_KEY: "github-private-key",
  GITHUB_APP_NAME: "pr-guard"
};

describe("AI provider dispatch", () => {
  beforeAll(() => {
    Object.assign(process.env, requiredEnv, {
      OPENAI_API_KEY: "",
      GOOGLE_AI_API_KEY: "",
      ANTHROPIC_API_KEY: ""
    });
  });

  it.each([
    ["OPENAI", "OPENAI_API_KEY is required for OpenAI reviews."],
    ["GOOGLE", "GOOGLE_AI_API_KEY is required for Google AI reviews."],
    ["CLAUDE", "ANTHROPIC_API_KEY is required for Claude reviews."]
  ] satisfies Array<[AIProvider, string]>)("routes %s requests to the matching adapter", async (provider, message) => {
    await expect(
      generateStructuredReview({
        provider,
        reviewerType: "QUALITY",
        diffContext: "No diff.",
        deterministicFindingSummaries: []
      })
    ).rejects.toThrow(message);
  });
});
