// vite.config.js
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';

/**
 * Emit `manifest.php` next to the bundle, naming the two content-hashed entry
 * files so PHP can enqueue them without scanning the directory.
 */
function emitPhpManifest() {
  const phpString = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

  return {
    name: 'kelune-crm-emit-php-manifest',
    generateBundle(_options, bundle) {
      let js = '';
      let css = '';

      for (const [fileName, output] of Object.entries(bundle)) {
        if ('chunk' === output.type && output.isEntry) {
          js = fileName;
        } else if ('asset' === output.type && fileName.endsWith('.css') && !fileName.includes('/')) {
          css = fileName;
        }
      }

      if (!js) {
        this.error('No entry chunk in the bundle — cannot write manifest.php.');
      }

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.php',
        source: `<?php
/**
 * Dashboard bundle manifest.
 *
 * @package KeluneCRM
 */

return array(
    'js'  => ${phpString(js)},
    'css' => ${phpString(css)},
);
`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), emitPhpManifest()],
  base: './',
  resolve: {
    alias: {
      // Route the standard WordPress i18n API to our shim over window.wp.i18n
      // (like @wordpress/scripts' dependency extraction). Keeps a single i18n
      // runtime and lets wp_set_script_translations() feed translations.
      '@wordpress/i18n': path.resolve(__dirname, 'src/utils/i18n.ts'),
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  build: {
    // Build target lives outside the Vite root (js-apps/dashboard/), so
    // emptyOutDir is required for Vite to clean it between builds.
    outDir: path.resolve(__dirname, '../../assets/apps/dashboard'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: './src/main.tsx',
      output: {
        manualChunks: {
          router: ['react-router-dom'],
          antd: ['antd'],
        },
        // Content hash only — never a build timestamp. The entry filename is
        // embedded in every chunk that imports from it, so a per-build token
        // there cascades into those chunks' hashes and renames files whose
        // code never changed. Builds must be reproducible.
        entryFileNames: `[name].[hash].js`,
        chunkFileNames: `js/[name].[hash].js`,
        assetFileNames: ({ name }) => {
          if (name && name.endsWith('.css')) {
            // Entry stylesheet at the dist root; route stylesheets under css/,
            // injected at runtime by the chunk that owns them.
            return 'main.css' === name
              ? `[name].[hash].[ext]`
              : `css/[name].[hash].[ext]`;
          }

          if (name && /\.(gif|jpe?g|png|svg)$/i.test(name)) {
            return `img/[name].[hash].[ext]`;
          }

          return `assets/[name].[hash].[ext]`;
        },
      },
    },
  },
});
