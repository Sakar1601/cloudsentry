/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16's dev server otherwise regenerates AGENTS.md/CLAUDE.md
  // (AI-agent guidance files) on every `next dev` run.
  agentRules: false,
  devIndicators: false,
};

// Static demo build: `NEXT_PUBLIC_STATIC_DEMO=1 npm run build` emits a
// self-contained site in out/ (no backend). NEXT_PUBLIC_BASE_PATH is for hosts
// that serve from a sub-path, e.g. GitHub Pages at /<repo>.
if (process.env.NEXT_PUBLIC_STATIC_DEMO === "1") {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = { unoptimized: true };
  if (process.env.NEXT_PUBLIC_BASE_PATH) nextConfig.basePath = process.env.NEXT_PUBLIC_BASE_PATH;
}

module.exports = nextConfig;
