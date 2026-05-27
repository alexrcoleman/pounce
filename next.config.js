const DEFAULT_PRODUCTION_SITE_URL = "https://pounce.live";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_SITE_URL
    : `http://localhost:${getConfiguredPort()}`);

function getConfiguredPort() {
  const portFlagIndex = process.argv.findIndex(
    (value) => value === "-p" || value === "--port"
  );
  const portFromSeparateArg =
    portFlagIndex >= 0 ? process.argv[portFlagIndex + 1] : undefined;
  const portFromEqualsArg = process.argv
    .find((value) => value.startsWith("--port="))
    ?.slice("--port=".length);

  return process.env.PORT || portFromSeparateArg || portFromEqualsArg || "3000";
}

/** @type {import('next').NextConfig} */
module.exports = {
  // reactStrictMode: true,
  transpilePackages: [
    "@ant-design/pro-editor",
    "antd",
    "@ant-design/icons",
    "rc-util",
    "rc-pagination",
    "rc-picker",
    "antd/es",
    "@ant-design",
    "@ant-design/icons-svg",
  ],
  env: {
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
    NEXT_PUBLIC_SITE_URL: siteUrl,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.woff2$/i,
      type: "asset/resource",
    });

    return config;
  },
};
