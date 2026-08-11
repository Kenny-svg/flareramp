import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Local development shares the executor's server-only credentials. Deployment
// environments should provide these variables directly instead of shipping this
// file. None are exposed to the browser without a NEXT_PUBLIC_ prefix.
dotenv.config({
  path: resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../executor/.env",
  ),
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["flareramp-executor"],
};

export default nextConfig;
