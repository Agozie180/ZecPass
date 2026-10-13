import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  webpack: (config, { webpack }) => {
    // Noir (noir_js + its acvm_js / noirc_abi WASM) bundles through webpack with
    // these experiments. @aztec/bb.js does NOT — it ships a prebuilt browser
    // bundle that webpack mis-wraps, so it is loaded as a same-origin native ES
    // module instead (see lib/proof/browser-ultrahonk.ts, vendored in public/).
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
      layers: true,
    };

    // Noir packages import Node built-ins with the `node:` scheme; strip it so
    // the client build resolves them through webpack's default browser fallbacks.
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
    );

    return config;
  },
};

export default nextConfig;
