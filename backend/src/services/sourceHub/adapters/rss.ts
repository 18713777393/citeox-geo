import { CollectionSourceType } from "@prisma/client";
import { notImplemented } from "../../../middleware/error.js";
import type { CollectionAdapter } from "../types.js";

export const rssAdapter: CollectionAdapter = {
  code: "rss",
  displayName: "RSS",
  type: CollectionSourceType.RSS,
  enabled: false,
  async collect() {
    throw notImplemented("RSS collection adapter after SSRF and MIME review");
  }
};
