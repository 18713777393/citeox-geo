import { CollectionSourceType } from "@prisma/client";
import { notImplemented } from "../../../middleware/error.js";
import type { CollectionAdapter } from "../types.js";

export function createSearchApiPlaceholder(code: string, displayName: string): CollectionAdapter {
  return {
    code,
    displayName,
    type: CollectionSourceType.SEARCH_API,
    enabled: false,
    async collect() {
      throw notImplemented(`${displayName} collection adapter`);
    }
  };
}

export const searchApiPlaceholders = [
  createSearchApiPlaceholder("bing_search", "Bing Search API"),
  createSearchApiPlaceholder("brave_search", "Brave Search API"),
  createSearchApiPlaceholder("tavily", "Tavily API"),
  createSearchApiPlaceholder("serpapi", "SerpAPI")
];
