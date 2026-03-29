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
    name: "basic-globe-performance-regression",
    title: "Basic Globe Performance Regression",
    description: "Deterministic browser demo for basic-globe style pan/zoom performance and tile request stability",
  },
  {
    name: "basic-globe-load-profile-regression",
    title: "Basic Globe Load Profile Regression",
    description: "Deterministic browser demo for baseline/stress load profiles and performance degradation ratio",
  },
  {
    name: "basic-globe-load-ladder-regression",
    title: "Basic Globe Load Ladder Regression",
    description: "Deterministic browser demo for baseline/medium/heavy load ladder and monotonic profile constraints",
  },
  {
    name: "basic-globe-load-recovery-regression",
    title: "Basic Globe Load Recovery Regression",
    description: "Deterministic browser demo for heavy-load overlay cleanup and scene/layer recovery constraints",
  },
  {
    name: "basic-globe-load-recovery-stress-regression",
    title: "Basic Globe Load Recovery Stress Regression",
    description: "Deterministic browser demo for multi-cycle heavy-load cleanup and recovery stability constraints",
  },
  {
    name: "basic-globe-load-recovery-endurance-regression",
    title: "Basic Globe Load Recovery Endurance Regression",
    description: "Deterministic browser demo for long-duration heavy/recovery interaction pressure and recovery stability constraints",
  },
  {
    name: "basic-globe-load-recovery-drift-regression",
    title: "Basic Globe Load Recovery Drift Regression",
    description: "Deterministic browser demo for multi-cycle heavy/recovery drift constraints on recovery consistency",
  },
  {
    name: "oblique-photogrammetry-regression",
    title: "Oblique Photogrammetry Regression",
    description: "Deterministic browser demo for oblique photogrammetry tileset visibility and pick stability",
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
  {
    name: "surface-tile-regression",
    title: "Surface Tile Regression",
    description: "Deterministic browser demo that switches active surface tiles without moving the camera",
  },
  {
    name: "surface-tile-resize-regression",
    title: "Surface Tile Resize Regression",
    description: "Deterministic browser demo that resizes the viewport and forces default tile reselection",
  },
  {
    name: "surface-tile-zoom-regression",
    title: "Surface Tile Zoom Regression",
    description: "Deterministic browser demo that zooms the camera, cancels stale tile requests and records performance metrics",
  },
  {
    name: "surface-tile-recovery-stages-regression",
    title: "Surface Tile Recovery Stages Regression",
    description: "Deterministic browser demo that triggers tile-load/tile-parse recovery stages and exports stage metrics",
  },
  {
    name: "surface-tile-coord-transform-regression",
    title: "Surface Tile Coord Transform Regression",
    description: "Deterministic browser demo that validates SurfaceTile coordTransform geometry consistency",
  },
  {
    name: "surface-tile-lifecycle-regression",
    title: "Surface Tile Lifecycle Regression",
    description: "Deterministic browser demo that validates SurfaceTile add/remove/re-add lifecycle consistency",
  },
  {
    name: "surface-tile-lifecycle-stress-regression",
    title: "Surface Tile Lifecycle Stress Regression",
    description: "Deterministic browser demo that validates multi-cycle SurfaceTile lifecycle stress consistency",
  },
  {
    name: "vector-tile-regression",
    title: "Vector Tile Regression",
    description: "Deterministic browser demo that validates VectorTile point/line/polygon rendering output",
  },
  {
    name: "projection-regression",
    title: "Projection Regression",
    description: "Deterministic browser demo that verifies coordinate transform round-trip precision",
  },
  {
    name: "terrarium-decode-regression",
    title: "Terrarium Decode Regression",
    description: "Deterministic browser demo that validates Terrarium decode worker hit-rate and fallback counts",
  },
  {
    name: "vector-pick-regression",
    title: "Vector Pick Regression",
    description: "Deterministic browser demo that validates VectorTile pick precision and miss fallback behavior",
  },
  {
    name: "vector-geometry-pick-regression",
    title: "Vector Geometry Pick Regression",
    description: "Deterministic browser demo that validates VectorTile point/line/polygon pick precision",
  },
  {
    name: "vector-multi-tile-pick-regression",
    title: "Vector Multi Tile Pick Regression",
    description: "Deterministic browser demo that validates VectorTile cross-tile boundary pick stability",
  },
  {
    name: "vector-overlap-pick-regression",
    title: "Vector Overlap Pick Regression",
    description: "Deterministic browser demo that validates VectorTile overlap pick priority by zIndex and depth",
  },
  {
    name: "vector-layer-zindex-pick-regression",
    title: "Vector Layer ZIndex Pick Regression",
    description: "Deterministic browser demo that validates cross-layer VectorTile pick precedence by layer zIndex",
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
