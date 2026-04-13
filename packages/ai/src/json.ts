import { aiReviewerOutputSchema, type AIReviewerOutput } from "@pr-guard/shared";

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }

  throw new Error("AI provider did not return a JSON object.");
}

export function parseAIReviewerOutput(text: string): AIReviewerOutput {
  const json = extractJsonObject(text);
  return aiReviewerOutputSchema.parse(json);
}
