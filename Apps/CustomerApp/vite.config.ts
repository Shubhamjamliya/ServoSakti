import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import babel from 'vite-plugin-babel';

// react-native packages ship Flow-typed source; route them through Babel for the web build.
const rnPackagePattern = /node_modules[\\/](react-native|@react-native|react-native-.*|@react-native-community)[\\/].*\.jsx?$/;

export default defineConfig({
  plugins: [
    react(),
    babel({
      filter: rnPackagePattern,
      babelConfig: { presets: ['@react-native/babel-preset'], babelrc: false, configFile: false },
    }),
  ],
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: /^lucide-react-native$/, replacement: 'lucide-react' },
    ],
  },
  define: { global: 'window', __DEV__: JSON.stringify(true) },
  server: { host: '0.0.0.0', port: 5175 },
});
