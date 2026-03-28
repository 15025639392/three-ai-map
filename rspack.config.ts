import { defineConfig } from "@rspack/cli";
import { HtmlRspackPlugin } from "@rspack/core";

const isProduction = process.env.NODE_ENV === "production";

const demos = [
  {
    name: "basic-globe",
    title: "Basic Globe",
    description: "Complete globe with tile imagery, elevation, markers, polylines, polygons, and camera tour",
  },
  {
    name: "gaode-satellite",
    title: "Gaode Satellite",
    description: "Gaode (Amap) satellite imagery with GCJ-02 coordinate transform and elevation",
  },
  {
    name: "gaode-satellite-labels",
    title: "Gaode Satellite + Labels",
    description: "Gaode satellite base with road/label overlay (dual SurfaceTileLayer)",
  },
  {
    name: "baidu-satellite",
    title: "Baidu Satellite",
    description: "Baidu satellite imagery with BD-09 coordinate transform and elevation",
  },
  {
    name: "baidu-road",
    title: "Baidu Road",
    description: "Baidu standard road map with Chinese labels and BD-09 transform",
  },
];

export default defineConfig({
  mode: isProduction ? "production" : "development",
  target: "web",
  entry: {
    index: "./src/main.ts",
    ...Object.fromEntries(
      demos.map((demo) => [
        demo.name,
        demo.name === "basic-globe"
          ? `./examples/basic-globe-entry.ts`
          : `./examples/${demo.name}.ts`,
      ])
    ),
  },
  devtool: isProduction ? false : "source-map",
  experiments: {
    css: true,
  },
  resolve: {
    extensions: ["...", ".ts"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: {
              syntax: "typescript",
            },
            target: "es2022",
            transform: {
              optimizer: {
                globals: {
                  vars: {
                    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
                  },
                },
              },
            },
          },
        },
      },
      {
        test: /\.css$/,
        type: "css",
      },
    ],
  },
  optimization: {
    minimize: isProduction,
    splitChunks: {
      chunks: "all",
      cacheGroups: {
        threejs: {
          name: "three",
          test: /[\\/]node_modules[\\/]three[\\/]/,
          priority: 30,
          reuseExistingChunk: true,
        },
        core: {
          name: "core",
          test: /[\\/]src[\\/](core|geo|globe|utils|projection)[\\/]/,
          priority: 20,
          reuseExistingChunk: true,
        },
        layers: {
          name: "layers",
          test: /[\\/]src[\\/]layers[\\/]/,
          priority: 15,
          reuseExistingChunk: true,
        },
        tiles: {
          name: "tiles",
          test: /[\\/]src[\\/]tiles[\\/]/,
          priority: 14,
          reuseExistingChunk: true,
        },
        spatial: {
          name: "spatial",
          test: /[\\/]src[\\/]spatial[\\/]/,
          priority: 13,
          reuseExistingChunk: true,
        },
        common: {
          name: "common",
          minChunks: 2,
          priority: 10,
          reuseExistingChunk: true,
        },
      },
    },
  },
  plugins: [
    // Index page: demos list
    new HtmlRspackPlugin({
      template: "./index.html",
      filename: "index.html",
      chunks: ["index"],
    }),
    // Demo pages
    ...demos.map((demo) =>
      new HtmlRspackPlugin({
        template: `./examples/${demo.name}.html`,
        filename: `${demo.name}.html`,
        chunks: [demo.name],
      })
    ),
  ],
  output: {
    clean: true,
    chunkFilename: "chunks/[name].[contenthash:8].js",
    publicPath: isProduction ? "./" : "/",
  },
  devServer: {
    host: "0.0.0.0",
    port: 3000,
    hot: true,
    open: true,
    historyApiFallback: true,
  },
});
