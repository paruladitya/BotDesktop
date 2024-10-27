const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
// webpack.config.js
const webpack = require('webpack');

module.exports = {
  devtool: 'source-map',
  entry: './src/renderer/index.tsx',
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  plugins: [
      new webpack.ProvidePlugin({
        global: 'global', // This will make global available in your bundled code
      }),
      new HtmlWebpackPlugin({
      template: './src/renderer/index.html'
    }),
  ],
};