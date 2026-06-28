import type {
  CollectionJob,
  CollectionSource,
  CollectionSourceType,
  Prisma
} from "@prisma/client";
import type { AuthContext } from "../../middleware/auth.js";

export interface SourceHubContext {
  auth: AuthContext;
  ipAddress?: string;
  userAgent?: string;
}

export interface RawCollectionItem {
  title: string;
  text?: string;
  sourceUrl?: string;
  url?: string;
  domain?: string;
  author?: string;
  publishedAt?: string | Date;
  language?: string;
  intent?: string;
  keywords?: string[];
  qualityScore?: number;
  trustScore?: number;
  metadata?: Record<string, unknown>;
}

export interface CollectionInput {
  source: CollectionSource;
  job: CollectionJob;
  input: Record<string, unknown>;
}

export interface CollectionAdapter {
  code: string;
  displayName: string;
  type: CollectionSourceType;
  enabled: boolean;
  collect(input: CollectionInput): Promise<RawCollectionItem[]>;
}

export type CollectionItemCreateInput = Prisma.CollectionItemCreateManyInput;

export interface ManualImportItemInput {
  title: string;
  text?: string;
  sourceUrl?: string;
  url?: string;
  author?: string;
  language?: string;
  intent?: string;
  keywords?: string[];
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}
