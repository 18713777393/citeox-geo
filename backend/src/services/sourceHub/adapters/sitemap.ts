import { CollectionSourceType } from "@prisma/client";
import { notImplemented } from "../../../middleware/error.js";
import type { CollectionAdapter } from "../types.js";

export const sitemapAdapter: CollectionAdapter = {
  code: "sitemap",
  displayName: "Sitemap",
  type: CollectionSourceType.SITEMAP,
  enabled: false,
  async collect() {
    throw notImplemented("Sitemap collection adapter after SSRF and robots review");
  }
};
