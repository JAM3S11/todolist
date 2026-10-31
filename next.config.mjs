// a new ID for every build, so an open app can tell when a newer version has gone live. Set once here so the
// build's worker processes (which load this file again) all use the same one.
process.env.NEXT_PUBLIC_BUILD_ID ||= process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID },
};

export default nextConfig;
