import type { AppSettings, Prisma } from "@prisma/client";
import { type AppSettingsInput, appSettingsSchema } from "@pr-guard/shared";
import { prisma } from "./client";

const APP_SETTINGS_ID = "app";

export function validateAppSettings(input: unknown): AppSettingsInput {
  return appSettingsSchema.parse(input);
}

export async function getOrCreateAppSettings(): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    update: {},
    create: { id: APP_SETTINGS_ID }
  });
}

export async function updateAppSettings(input: unknown): Promise<AppSettings> {
  const settings = validateAppSettings(input);

  return prisma.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    update: settings satisfies Prisma.AppSettingsUpdateInput,
    create: {
      id: APP_SETTINGS_ID,
      ...settings
    }
  });
}
