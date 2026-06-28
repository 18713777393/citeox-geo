import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { seedPlans } from "../src/services/entitlements.js";
import { seedModelPricing } from "../src/services/credits.js";
import { encryptSensitive, hashEmail } from "../src/services/authSecurity.js";

await seedPlans();
await seedModelPricing();
await seedDefaultInviteCodes();
await seedAdministrator();

await prisma.$disconnect();
console.log("Seeded Citeox GEO plans, model pricing, invite codes and administrator configuration.");

async function seedAdministrator() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!adminEmail && !adminPassword) {
    console.log("Skipped administrator seed. Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD to create one.");
    return;
  }

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must be set together to seed an administrator.");
  }

  const organization = await prisma.organization.upsert({
    where: { slug: "platform-admin" },
    update: { name: "Citeox GEO 平台管理", industry: "platform" },
    create: {
      name: "Citeox GEO 平台管理",
      slug: "platform-admin",
      industry: "platform"
    }
  });
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: adminEmail }, { emailHash: hashEmail(adminEmail) }]
    }
  });

  const admin = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          organizationId: organization.id,
          username: existing.username || "platform_admin",
          displayName: process.env.ADMIN_NAME || "平台管理员",
          emailHash: hashEmail(adminEmail),
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
          hasBrand: true
        }
      })
    : await prisma.user.create({
        data: {
          organizationId: organization.id,
          username: "platform_admin",
          email: encryptSensitive(adminEmail),
          emailHash: hashEmail(adminEmail),
          displayName: process.env.ADMIN_NAME || "平台管理员",
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
          hasBrand: true
        }
      });

  await prisma.organization.update({
    where: { id: organization.id },
    data: { ownerId: admin.id }
  });

  console.log(`Seeded administrator account: ${adminEmail}`);
}

async function seedDefaultInviteCodes() {
  await prisma.inviteCode.upsert({
    where: { code: "20260621" },
    update: {
      benefit: "新用户邀请体验权益",
      isActive: true
    },
    create: {
      code: "20260621",
      maxUses: 1000,
      benefit: "新用户邀请体验权益",
      isActive: true
    }
  });
}
