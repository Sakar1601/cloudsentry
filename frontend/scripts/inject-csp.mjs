// Adds a Content-Security-Policy to every page of the static demo. GitHub Pages cannot
// send response headers, so the policy goes in a <meta> tag, with a hash for each inline
// script Next.js emitted on that page.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";
const pages = readdirSync(OUT, { recursive: true }).filter((file) => file.endsWith(".html"));
if (pages.length === 0) throw new Error(`No HTML files found in ${OUT}/`);

for (const page of pages) {
  const path = join(OUT, page);
  const html = readFileSync(path, "utf8");
  const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .filter(([, body]) => body)
    .map(([, body]) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`);
  const policy = [
    "default-src 'self'",
    ["script-src 'self'", ...new Set(hashes)].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const head = /<head[^>]*>/;
  if (!head.test(html)) throw new Error(`${path} has no <head>`);
  const tags =
    `<meta http-equiv="Content-Security-Policy" content="${policy}"/>` +
    '<meta name="referrer" content="strict-origin-when-cross-origin"/>';
  writeFileSync(path, html.replace(head, (match) => match + tags));
}
console.log(`Added a Content-Security-Policy to ${pages.length} pages`);
