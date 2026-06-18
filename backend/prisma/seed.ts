import { prisma } from "../src/lib/prisma.js";
import { seedPlans } from "../src/services/entitlements.js";
import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "@prisma/client";

await seedPlans();

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

if (adminEmail || adminPassword) {
  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must be set together to seed an administrator.");
  }

  const organization = await prisma.organization.upsert({
    where: { slug: "platform-admin" },
    update: {},
    create: {
      name: "智引GEO 平台管理",
      slug: "platform-admin",
      industry: "platform"
    }
  });
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      organizationId: organization.id,
      displayName: process.env.ADMIN_NAME || "平台管理员",
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE
    },
    create: {
      organizationId: organization.id,
      email: adminEmail,
      displayName: process.env.ADMIN_NAME || "平台管理员",
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE
    }
  });

  await prisma.organization.update({
    where: { id: organization.id },
    data: { ownerId: admin.id }
  });

  console.log(`Seeded administrator account: ${admin.email}`);
} else {
  console.log("Skipped administrator seed. Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD to create one.");
}

await prisma.$disconnect();

console.log("Seeded GEO plans.");
