import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
};

// Accepts localhost (any port, for local dev) plus every subdomain of the
// Cloudflare Pages project (production + every preview deployment url), so
// a new preview build never needs a CORS config change to work. Shared by
// both the Express CORS middleware (index.ts) and Socket.IO (socket.ts).
const allowedOriginPattern = /^https?:\/\/(localhost:\d+|([a-z0-9-]+\.)?bhattaaa\.pages\.dev)$/;

export function isAllowedOrigin(origin: string | undefined) {
  return !origin || allowedOriginPattern.test(origin);
}
