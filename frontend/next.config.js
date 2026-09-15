/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16's dev server otherwise regenerates AGENTS.md/CLAUDE.md
  // (AI-agent guidance files) on every `next dev` run.
  agentRules: false,
};

module.exports = nextConfig;
