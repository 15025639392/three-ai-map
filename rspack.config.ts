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
            target: "es2022"
          }
        }
      },
      {
        test: /\.css$/,
        type: "css"
      }
    ]
  },
  plugins: [new HtmlRspackPlugin({ template: "./index.html" })],
  output: {
    clean: true,
    chunkFilename: "chunks/[name].[contenthash:8].js"
  },
  devServer: {
    host: "0.0.0.0",
    port: 3000,
    hot: true,
    open: false
  }
});
