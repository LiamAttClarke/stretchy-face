const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const DIST_PATH = path.join(__dirname, 'dist');

module.exports = {
  entry: './src/main.ts',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: DIST_PATH }
      ],
    })
  ],
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: DIST_PATH,
  },
  devtool: 'source-map',
  devServer: {
    host: '0.0.0.0',
    contentBase: DIST_PATH,
    compress: true,
    port: 9000,
  }
};
