import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "mammoth", "adm-zip", "@huggingface/transformers"],
  outputFileTracingIncludes: {
    "/api/career-tutor/*": ["./data/models/**/*"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          // The Content-Security-Policy is set per request in proxy.ts, which is
          // where the script nonce is generated.
        ],
      },
    ];
  },
};

export default nextConfig;
