import type { AuditSeverity as PrismaAuditSeverity, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEvent {
  organizationId?: string;
  actorUserId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      severity: (event.severity ?? "info").toUpperCase() as PrismaAuditSeverity,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      metadata: event.metadata as Prisma.InputJsonValue | undefined
    }
  });
}
