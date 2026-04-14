import type { Prisma, RepositorySettings } from "@prisma/client";
import {
  type RepositorySettingsInput,
  repositorySettingsSchema
} from "@pr-guard/shared";
import { prisma } from "./client";

export function validateRepositorySettings(input: unknown): RepositorySettingsInput {
  return repositorySettingsSchema.parse(input);
}

export async function getOrCreateRepositorySettings(
  repositoryId: string
): Promise<RepositorySettings> {
  return prisma.repositorySettings.upsert({
    where: { repositoryId },
    update: {},
    create: {
      repositoryId,
      qualityEnabled: true,
      securityEnabled: true,
      architectureEnabled: true,
      minimumSeverity: "MEDIUM"
    }
  });
}

export async function updateRepositorySettings(
  repositoryId: string,
  input: unknown
): Promise<RepositorySettings> {
  const settings = validateRepositorySettings(input);

  return prisma.repositorySettings.upsert({
    where: { repositoryId },
    update: settings satisfies Prisma.RepositorySettingsUpdateInput,
    create: {
      repositoryId,
      ...settings
    }
  });
}
