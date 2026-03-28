import { defineConfig } from "@rspack/cli";
import { HtmlRspackPlugin } from "@rspack/core";

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
  mode: isProduction ? "production" : "development",
  target: "web",
  entry: "./src/main.ts",
  devtool: isProduction ? false : "source-map",
  experiments: {
    css: true
  },
  resolve: {
    extensions: ["...", ".ts"]
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
              syntax: "typescript"
            },
            target: "es2022",
            transform: {
              optimizer: {
                globals: {
                  vars: {
                    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV)
                  }
                }
              }
            }
          }
        }
      },
      {
        test: /\.css$/,
        type: "css"
      }
    ]
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
          reuseExistingChunk: true
        },
        core: {
          name: "core",
          test: /[\\/]src[\\/](core|geo|globe|utils|projection)[\\/]/,
          priority: 20,
          reuseExistingChunk: true
        },
        layers: {
          name: "layers",
          test: /[\\/]src[\\/]layers[\\/]/,
          priority: 15,
          reuseExistingChunk: true
        },
        tiles: {
          name: "tiles",
          test: /[\\/]src[\\/]tiles[\\/]/,
          priority: 14,
          reuseExistingChunk: true
        },
        spatial: {
          name: "spatial",
          test: /[\\/]src[\\/]spatial[\\/]/,
          priority: 13,
          reuseExistingChunk: true
        },
        common: {
          name: "common",
          minChunks: 2,
          priority: 10,
          reuseExistingChunk: true
        }
      }
    }
  },
  plugins: [new HtmlRspackPlugin({ template: "./index.html" })],
  output: {
    clean: true,
    chunkFilename: "chunks/[name].[contenthash:8].js",
    publicPath: isProduction ? "./" : "/"
  },
  devServer: {
    host: "0.0.0.0",
    port: 3000,
    hot: true,
    open: false
  }
});
