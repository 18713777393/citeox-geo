import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { CollectionItemCreateInput } from "./types.js";

export interface DedupedCollectionItems {
  items: CollectionItemCreateInput[];
  dedupedCount: number;
}

export async function filterDuplicateCollectionItems(
  items: CollectionItemCreateInput[]
): Promise<DedupedCollectionItems> {
  const unique = uniqueInPayload(items);

  if (!unique.length) {
    return { items: [], dedupedCount: items.length };
  }

  const sourceId = unique[0]?.sourceId;
  const organizationId = unique[0]?.organizationId;
  const projectIds = [...new Set(unique.map((item) => item.projectId).filter(isString))];
  const hashes = [...new Set(unique.map((item) => item.contentHash))];
  const urls = [...new Set(unique.map((item) => item.url).filter(isString))];
  const titles = [...new Set(unique.map((item) => item.rawTitle))];

  const existingItemConditions: Prisma.CollectionItemWhereInput[] = [];

  if (hashes.length) {
    existingItemConditions.push({ contentHash: { in: hashes } });
  }

  if (urls.length) {
    existingItemConditions.push({ url: { in: urls } });
  }

  if (titles.length) {
    existingItemConditions.push({ rawTitle: { in: titles } });
  }

  const existingItems = existingItemConditions.length
    ? await prisma.collectionItem.findMany({
        where: {
          organizationId,
          sourceId,
          OR: existingItemConditions
        },
        select: {
          contentHash: true,
          rawTitle: true,
          url: true
        }
      })
    : [];

  const existingQuestions = projectIds.length
    ? await prisma.question.findMany({
        where: {
          projectId: { in: projectIds },
          title: { in: titles }
        },
        select: {
          projectId: true,
          title: true
        }
      })
    : [];

  const existingHashes = new Set(existingItems.map((item) => item.contentHash));
  const existingUrls = new Set(existingItems.map((item) => item.url).filter(isString));
  const existingTitles = new Set(existingItems.map((item) => item.rawTitle.toLowerCase()));
  const existingQuestionTitles = new Set(existingQuestions.map((question) => `${question.projectId}:${question.title.toLowerCase()}`));
  const filtered = unique.filter((item) => {
    if (existingHashes.has(item.contentHash)) return false;
    if (item.url && existingUrls.has(item.url)) return false;
    if (existingTitles.has(item.rawTitle.toLowerCase())) return false;
    if (item.projectId && existingQuestionTitles.has(`${item.projectId}:${item.rawTitle.toLowerCase()}`)) return false;
    return true;
  });

  return {
    items: filtered,
    dedupedCount: items.length - filtered.length
  };
}

function uniqueInPayload(items: CollectionItemCreateInput[]) {
  const seen = new Set<string>();
  const unique: CollectionItemCreateInput[] = [];

  for (const item of items) {
    const key = [
      item.contentHash,
      item.url ?? "",
      item.projectId ?? "",
      item.rawTitle.toLowerCase()
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
