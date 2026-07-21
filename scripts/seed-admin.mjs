#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const defaultAdminEmail = "a1781194749@gmail.com";

function loadEnvFile(file) {
  if (!existsSync(file)) {
    return;
  }

  const text = readFileSync(file, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function emailToUserId(email) {
  return `email_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

function configuredAdminEmails() {
  const configured = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || defaultAdminEmail;
  const emails = configured
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  return [...new Set(emails)];
}

async function seedAdminUser(client, email) {
  const existing = await client.query(
    'SELECT "id" FROM "User" WHERE lower("email") = $1 LIMIT 1',
    [email],
  );
  const userId = existing.rows[0]?.id ?? emailToUserId(email);

  await client.query(
    `
      INSERT INTO "User" ("id", "email", "displayName", "role", "updatedAt")
      VALUES ($1, $2, $3, 'ADMIN', CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE
      SET
        "email" = EXCLUDED."email",
        "displayName" = COALESCE("User"."displayName", EXCLUDED."displayName"),
        "role" = 'ADMIN',
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    [userId, email, "平台管理员"],
  );

  await client.query(
    `
      INSERT INTO "AuthAccount" ("id", "userId", "provider", "providerUserId")
      VALUES ($1, $2, 'EMAIL', $3)
      ON CONFLICT ("provider", "providerUserId") DO UPDATE
      SET "userId" = EXCLUDED."userId"
    `,
    [`email_admin_${createHash("sha256").update(email).digest("hex").slice(0, 24)}`, userId, email],
  );

  return userId;
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
  loadEnvFile(".env.production.local");

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed admin users.");
  }

  const emails = configuredAdminEmails();

  if (emails.length === 0) {
    throw new Error("ADMIN_EMAIL or ADMIN_EMAILS must include at least one email.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const email of emails) {
      const userId = await seedAdminUser(client, email);
      console.log(`Seeded admin user ${email} (${userId}).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
