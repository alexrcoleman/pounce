import type { StorybookConfig } from "@storybook/nextjs";
import path from "path";

const rootDir = process.cwd();

const config: StorybookConfig = {
  stories: ["../client/**/*.stories.@(ts|tsx)"],
  staticDirs: ["../public"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  webpackFinal: async (config) => {
    config.module = config.module ?? {};
    config.module.rules = config.module.rules ?? [];
    config.module.rules.push({
      test: /\.[jt]sx?$/,
      include: [
        path.resolve(rootDir, ".storybook"),
        path.resolve(rootDir, "client"),
        path.resolve(rootDir, "shared"),
      ],
      use: {
        loader: "babel-loader",
        options: {
          cacheDirectory: true,
          presets: ["next/babel"],
        },
      },
    });

    return config;
  },
};

export default config;
