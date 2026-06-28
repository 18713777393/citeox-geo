import { CollectionSourceType, type CollectionSource } from "@prisma/client";
import { HttpError, notImplemented } from "../../middleware/error.js";
import { manualImportAdapter } from "./adapters/manualImport.js";
import { rssAdapter } from "./adapters/rss.js";
import { searchApiPlaceholders } from "./adapters/searchApi.js";
import { sitemapAdapter } from "./adapters/sitemap.js";
import { websiteAdapter } from "./adapters/website.js";
import type { CollectionAdapter } from "./types.js";

const socialPlaceholders: CollectionAdapter[] = [
  placeholder("zhihu_public", "Zhihu public placeholder", CollectionSourceType.SOCIAL_PUBLIC),
  placeholder("xiaohongshu_public", "Xiaohongshu public placeholder", CollectionSourceType.SOCIAL_PUBLIC),
  placeholder("douyin_public", "Douyin public placeholder", CollectionSourceType.SOCIAL_PUBLIC),
  placeholder("bilibili_public", "Bilibili public placeholder", CollectionSourceType.SOCIAL_PUBLIC),
  placeholder("wechat_public", "WeChat public account placeholder", CollectionSourceType.SOCIAL_PUBLIC)
];

const adapters = [
  manualImportAdapter,
  sitemapAdapter,
  rssAdapter,
  websiteAdapter,
  ...searchApiPlaceholders,
  ...socialPlaceholders
];

export function getAdapterForSource(source: Pick<CollectionSource, "code" | "type">): CollectionAdapter {
  const byCode = adapters.find((adapter) => adapter.code === source.code);

  if (byCode) {
    return byCode;
  }

  const byType = adapters.find((adapter) => adapter.type === source.type);

  if (byType) {
    return byType;
  }

  throw new HttpError(400, "SOURCE_ADAPTER_UNKNOWN", "Collection source adapter is not registered.");
}

export function listSourceAdapters() {
  return adapters.map((adapter) => ({
    code: adapter.code,
    displayName: adapter.displayName,
    type: adapter.type,
    enabled: adapter.enabled
  }));
}

function placeholder(code: string, displayName: string, type: CollectionSourceType): CollectionAdapter {
  return {
    code,
    displayName,
    type,
    enabled: false,
    async collect() {
      throw notImplemented(`${displayName} adapter`);
    }
  };
}
