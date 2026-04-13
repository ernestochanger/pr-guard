import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization",
      "GITHUB_PRIVATE_KEY",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_APP_CLIENT_SECRET",
      "OPENAI_API_KEY",
      "GOOGLE_AI_API_KEY",
      "NEXTAUTH_SECRET"
    ],
    remove: true
  }
});
