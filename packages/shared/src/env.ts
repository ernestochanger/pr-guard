import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

let envFilesLoaded = false;

export function loadEnvFiles(): void {
  if (envFilesLoaded) {
    return;
  }

  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "../.env"),
    path.join(process.cwd(), "../../.env")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false, quiet: true });
    }
  }

  envFilesLoaded = true;
}

const optionalIntegerString = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (!value || value.trim() === "") {
        return defaultValue;
      }
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) {
        throw new Error(`Expected an integer but received "${value}".`);
      }
      return parsed;
    });

export const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_CLIENT_ID: z.string().min(1),
  GITHUB_APP_CLIENT_SECRET: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_PRIVATE_KEY: z.string().min(1),
  GITHUB_APP_NAME: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANALYSIS_MAX_FILES: optionalIntegerString(40),
  ANALYSIS_MAX_PATCH_CHARS: optionalIntegerString(60000),
  AI_TIMEOUT_MS: optionalIntegerString(45000),
  LOG_LEVEL: z.string().default("info")
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export const authEnvSchema = runtimeEnvSchema.pick({
  NODE_ENV: true,
  NEXTAUTH_SECRET: true,
  GITHUB_CLIENT_ID: true,
  GITHUB_CLIENT_SECRET: true,
  DATABASE_URL: true
});

export const githubAppEnvSchema = runtimeEnvSchema.pick({
  GITHUB_APP_ID: true,
  GITHUB_WEBHOOK_SECRET: true,
  GITHUB_PRIVATE_KEY: true,
  GITHUB_APP_NAME: true
});

export const redisEnvSchema = runtimeEnvSchema.pick({
  REDIS_URL: true
});

export const appUrlEnvSchema = runtimeEnvSchema.pick({
  APP_URL: true
});

export const databaseEnvSchema = runtimeEnvSchema.pick({
  DATABASE_URL: true,
  NODE_ENV: true
});

export type AuthEnv = z.infer<typeof authEnvSchema>;
export type GitHubAppEnv = z.infer<typeof githubAppEnvSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;
export type AppUrlEnv = z.infer<typeof appUrlEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

let cachedEnv: RuntimeEnv | null = null;
let cachedAuthEnv: AuthEnv | null = null;
let cachedGitHubAppEnv: GitHubAppEnv | null = null;
let cachedRedisEnv: RedisEnv | null = null;
let cachedAppUrlEnv: AppUrlEnv | null = null;
let cachedDatabaseEnv: DatabaseEnv | null = null;

function parseEnv<T>(schema: z.ZodSchema<T>, source: NodeJS.ProcessEnv, label: string): T {
  loadEnvFiles();
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ${label} environment configuration: ${details}`);
  }
  return parsed.data;
}

export function getRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = parseEnv(runtimeEnvSchema, source, "runtime");
  return cachedEnv;
}

export function getAuthEnv(source: NodeJS.ProcessEnv = process.env): AuthEnv {
  cachedAuthEnv ??= parseEnv(authEnvSchema, source, "auth");
  return cachedAuthEnv;
}

export function getGitHubAppEnv(source: NodeJS.ProcessEnv = process.env): GitHubAppEnv {
  cachedGitHubAppEnv ??= parseEnv(githubAppEnvSchema, source, "GitHub App");
  return cachedGitHubAppEnv;
}

export function getRedisEnv(source: NodeJS.ProcessEnv = process.env): RedisEnv {
  cachedRedisEnv ??= parseEnv(redisEnvSchema, source, "Redis");
  return cachedRedisEnv;
}

export function getAppUrlEnv(source: NodeJS.ProcessEnv = process.env): AppUrlEnv {
  cachedAppUrlEnv ??= parseEnv(appUrlEnvSchema, source, "app URL");
  return cachedAppUrlEnv;
}

export function getDatabaseEnv(source: NodeJS.ProcessEnv = process.env): DatabaseEnv {
  cachedDatabaseEnv ??= parseEnv(databaseEnvSchema, source, "database");
  return cachedDatabaseEnv;
}

export function resetRuntimeEnvForTests(): void {
  cachedEnv = null;
  cachedAuthEnv = null;
  cachedGitHubAppEnv = null;
  cachedRedisEnv = null;
  cachedAppUrlEnv = null;
  cachedDatabaseEnv = null;
  envFilesLoaded = false;
}
