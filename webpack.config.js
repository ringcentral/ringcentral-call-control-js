const path = require('path');

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'build'),
    library: 'RingCentralCallControl',
    libraryTarget: 'umd',
    libraryExport: 'default'
  },
  externals: {
    externals: {
      ringcentral: {
        commonjs: 'ringcentral',
        commonjs2: 'ringcentral',
        amd: 'ringcentral',
        root: 'RingCentral'
      }
    },
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  optimization: {
    minimize: false
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
};
