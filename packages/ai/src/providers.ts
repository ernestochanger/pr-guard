import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import {
  type AIProvider,
  type AIReviewerOutput,
  type ReviewerType,
  getRuntimeEnv,
  logger
} from "@pr-guard/shared";
import { parseAIReviewerOutput } from "./json";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

type AIReviewerType = Extract<ReviewerType, "QUALITY" | "SECURITY" | "ARCHITECTURE">;

export type StructuredReviewRequest = {
  provider: AIProvider;
  reviewerType: AIReviewerType;
  diffContext: string;
  deterministicFindingSummaries?: string[];
};

export type StructuredReviewResult = {
  provider: AIProvider;
  reviewerType: AIReviewerType;
  output: AIReviewerOutput;
  rawText: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
};

const providerDefaults: Record<AIProvider, string> = {
  OPENAI: "gpt-4.1-mini",
  GOOGLE: "gemini-2.0-flash"
};

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastError;
}

async function runOpenAI(request: StructuredReviewRequest): Promise<StructuredReviewResult> {
  const env = getRuntimeEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for OpenAI reviews.");
  }

  const model = providerDefaults.OPENAI;
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await withRetry(() =>
    client.chat.completions.create(
      {
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(request.reviewerType) },
          {
            role: "user",
            content: buildUserPrompt({
              reviewerType: request.reviewerType,
              diffContext: request.diffContext,
              deterministicFindingSummaries: request.deterministicFindingSummaries ?? []
            })
          }
        ]
      },
      { signal: timeoutSignal(env.AI_TIMEOUT_MS) }
    )
  );

  const rawText = response.choices[0]?.message?.content ?? "{}";
  return {
    provider: "OPENAI",
    reviewerType: request.reviewerType,
    output: parseAIReviewerOutput(rawText),
    rawText,
    model,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens
  };
}

async function runGoogle(request: StructuredReviewRequest): Promise<StructuredReviewResult> {
  const env = getRuntimeEnv();
  if (!env.GOOGLE_AI_API_KEY) {
    throw new Error("GOOGLE_AI_API_KEY is required for Google AI reviews.");
  }

  const model = providerDefaults.GOOGLE;
  const client = new GoogleGenerativeAI(env.GOOGLE_AI_API_KEY);
  const generativeModel = client.getGenerativeModel({
    model,
    systemInstruction: buildSystemPrompt(request.reviewerType),
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  });

  const prompt = buildUserPrompt({
    reviewerType: request.reviewerType,
    diffContext: request.diffContext,
    deterministicFindingSummaries: request.deterministicFindingSummaries ?? []
  });

  const result = await withRetry(async () => {
    const signal = timeoutSignal(env.AI_TIMEOUT_MS);
    const generation = generativeModel.generateContent(prompt);
    const abort = new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Google AI request timed out.")), {
        once: true
      });
    });
    return Promise.race([generation, abort]);
  });

  const rawText = result.response.text();
  return {
    provider: "GOOGLE",
    reviewerType: request.reviewerType,
    output: parseAIReviewerOutput(rawText),
    rawText,
    model
  };
}

export async function generateStructuredReview(
  request: StructuredReviewRequest
): Promise<StructuredReviewResult> {
  logger.info({ provider: request.provider, reviewerType: request.reviewerType }, "Running AI reviewer");

  if (request.provider === "OPENAI") {
    return runOpenAI(request);
  }
  return runGoogle(request);
}
