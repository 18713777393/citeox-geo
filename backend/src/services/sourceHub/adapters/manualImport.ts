import { CollectionSourceType } from "@prisma/client";
import { HttpError } from "../../../middleware/error.js";
import type { CollectionAdapter, ManualImportItemInput, RawCollectionItem } from "../types.js";

export const manualImportAdapter: CollectionAdapter = {
  code: "manual_import",
  displayName: "Manual import",
  type: CollectionSourceType.MANUAL_IMPORT,
  enabled: true,
  async collect({ input }) {
    const items = Array.isArray(input.items) ? input.items : [];

    if (!items.length) {
      throw new HttpError(400, "MANUAL_IMPORT_EMPTY", "Manual import requires at least one item.");
    }

    return items.map(toRawCollectionItem);
  }
};

function toRawCollectionItem(value: unknown): RawCollectionItem {
  if (!value || typeof value !== "object") {
    throw new HttpError(400, "MANUAL_IMPORT_INVALID_ITEM", "Manual import item is invalid.");
  }

  const item = value as ManualImportItemInput;

  if (!item.title?.trim()) {
    throw new HttpError(400, "MANUAL_IMPORT_INVALID_ITEM", "Manual import item title is required.");
  }

  return {
    title: item.title,
    text: item.text,
    sourceUrl: item.sourceUrl ?? item.url,
    author: item.author,
    language: item.language,
    intent: item.intent,
    keywords: item.keywords,
    publishedAt: item.publishedAt,
    metadata: item.metadata
  };
}
