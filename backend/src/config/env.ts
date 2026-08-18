import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
};

// Accepts localhost (any port, for local dev), every subdomain of the
// Cloudflare Pages project (kept as a fallback during the VPS migration —
// see PRODUCTION_DOMAIN below for the real deployment target), and — once
// PRODUCTION_DOMAIN is set — that exact domain plus its subdomains. Shared
// by both the Express CORS middleware (index.ts) and Socket.IO (socket.ts).
const productionDomain = process.env.PRODUCTION_DOMAIN;
const productionDomainPattern = productionDomain
  ? `|([a-z0-9-]+\\.)?${productionDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
  : "";
const allowedOriginPattern = new RegExp(
  `^https?:\\/\\/(localhost:\\d+|([a-z0-9-]+\\.)?bhattaaa\\.pages\\.dev${productionDomainPattern})$`
);

export function isAllowedOrigin(origin: string | undefined) {
  return !origin || allowedOriginPattern.test(origin);
}
