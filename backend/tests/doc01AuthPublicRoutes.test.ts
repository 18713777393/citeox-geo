import assert from "node:assert/strict";
import { authRouter } from "../src/routes/auth.js";

type ExpressLayer = {
  name?: string;
  route?: {
    path: string | string[];
    stack: Array<{ name?: string }>;
  };
};

const publicAuthPaths = new Set([
  "/check-username",
  "/validate-invite-code",
  "/validate-industry",
  "/send-code",
  "/send-verify-code",
  "/register",
  "/login",
  "/refresh",
  "/request-password-reset",
  "/forgot-password",
  "/reset-password",
  "/email-suggestion"
]);

const layers = (authRouter.stack ?? []) as ExpressLayer[];
const routeLayers = layers.filter((layer) => layer.route);

for (const expectedPath of publicAuthPaths) {
  const match = routeLayers.find((layer) => {
    const path = layer.route?.path;
    return Array.isArray(path) ? path.includes(expectedPath) : path === expectedPath;
  });

  assert.ok(match, `Missing public auth route ${expectedPath}.`);

  const middlewareNames = match.route?.stack.map((item) => item.name ?? "") ?? [];
  assert.ok(
    !middlewareNames.includes("requireAuth"),
    `DOC-01 public auth route ${expectedPath} must not require login.`
  );
}

for (const protectedPath of ["/logout", "/me"]) {
  const match = routeLayers.find((layer) => {
    const path = layer.route?.path;
    return Array.isArray(path) ? path.includes(protectedPath) : path === protectedPath;
  });
  assert.ok(match, `Missing protected auth route ${protectedPath}.`);
  const middlewareNames = match.route?.stack.map((item) => item.name ?? "") ?? [];
  assert.ok(
    middlewareNames.includes("requireAuth"),
    `Protected auth route ${protectedPath} must require login.`
  );
}

console.log("DOC-01 auth public route checks passed.");
