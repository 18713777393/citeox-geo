import { CollectionSourceType } from "@prisma/client";
import { notImplemented } from "../../../middleware/error.js";
import type { CollectionAdapter } from "../types.js";

export const websiteAdapter: CollectionAdapter = {
  code: "website_public",
  displayName: "Public website",
  type: CollectionSourceType.WEBSITE,
  enabled: false,
  async collect() {
    throw notImplemented("Public website collection adapter after robots and SSRF review");
  }
};
