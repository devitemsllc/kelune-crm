// vite.config.js
import react from '@vitejs/plugin-react';
import { build, defineConfig } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'path';

// Minification hoists shared helpers above rollup's own iife wrapper, leaving
// top-level vars like `de`/`na`/`Ge` on window. This closes over them; the
// intended globals are set via explicit `window.` assignments and survive.
function wrapInIife() {
  return {
    name: 'kelune-crm-wrap-in-iife',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') {
          file.code = `(function(){\n${file.code}\n})();\n`;
        }
      }
    },
  };
}

/** WordPress ships React; no bundle carries its own copy. */
const reactGlobals = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'ReactDOM',
  'react/jsx-runtime': 'ReactJSXRuntime',
  'react/jsx-dev-runtime': 'ReactJSXRuntime',
};

// Each vendor bundle hangs its packages off one global that the app reads.
// `dayjs` belongs with antd: rc-picker uses it internally, and a second copy
// would put the app's `dayjs.extend(…)` on a different instance than DatePicker.
// Only bare specifiers are externalised, so deep imports stay with the app.
const vendorBundles = {
  antd: {
    global: 'KeluneCRMAntd',
    packages: {
      antd: 'antd',
      '@ant-design/icons': 'icons',
      dayjs: 'dayjs',
    },
  },
  charts: {
    global: 'KeluneCRMCharts',
    packages: { '@ant-design/charts': 'charts' },
  },
  editors: {
    global: 'KeluneCRMEditors',
    packages: {
      '@uiw/react-codemirror': 'codemirror',
      '@codemirror/lang-html': 'langHtml',
      '@codemirror/view': 'view',
      juice: 'juice',
    },
  },
};

/** Package specifier → the global expression carrying it, for the app build. */
const appGlobals = Object.fromEntries(
  Object.values(vendorBundles).flatMap(({ global, packages }) =>
    Object.entries(packages).map(([pkg, key]) => [pkg, `${global}.${key}`])
  )
);

const VENDOR_ENTRY = '\0kelune-crm-vendor-entry';

function readAppSources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return readAppSources(full);
    }

    // .d.ts: no runtime imports, and `typeof import('pkg')` would read as one.
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')
      ? [readFileSync(full, 'utf8')]
      : [];
  });
}

// What the app imports from `pkg`. Entries are generated from real usage because
// re-exporting whole packages defeats tree-shaking and nearly doubles the size.
function scanPackageUsage(sources, pkg) {
  const quoted = `['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`;
  const names = new Set();
  let hasDefault = false;
  let whole = false;

  for (const source of sources) {
    // Barring quotes/semicolons keeps each match inside one statement.
    const statements = source.matchAll(
      new RegExp(String.raw`import\s+([^'";]*?)\s*from\s*${quoted}`, 'g')
    );

    for (const [, clause] of statements) {
      if (/^type\b/.test(clause)) {
        continue;
      }

      if (/^\*\s+as\b/.test(clause)) {
        whole = true;
        continue;
      }

      const braced = clause.match(/\{([\s\S]*)\}/);

      if (braced) {
        for (const specifier of braced[1].split(',')) {
          const name = specifier.trim().split(/\s+as\s+/)[0].trim();

          // Plain identifiers only: skips `type Foo`, comments, stray tokens.
          if (/^[A-Za-z_$][\w$]*$/.test(name)) {
            names.add(name);
          }
        }
      }

      if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim())) {
        hasDefault = true;
      }
    }

    if (new RegExp(String.raw`import\s*\(\s*${quoted}\s*\)`).test(source)) {
      whole = true;
    }
  }

  return { names: [...names].sort(), hasDefault, whole };
}

// Namespace shape (named keys plus `default`) is what `interop: 'esModule'` wants.
function generateVendorEntry(bundle) {
  const sources = readAppSources(path.resolve(__dirname, 'src'));
  const imports = [];
  const members = [];

  Object.entries(bundle.packages).forEach(([pkg, key], index) => {
    const usage = scanPackageUsage(sources, pkg);
    const alias = `_p${index}`;

    if (usage.whole || (!usage.names.length && !usage.hasDefault)) {
      imports.push(`import * as ${alias} from '${pkg}';`);
      members.push(`${key}: ${alias}`);
      return;
    }

    const parts = usage.names.map((name) => `${name} as ${alias}_${name}`);
    const shape = usage.names.map((name) => `${name}: ${alias}_${name}`);

    if (usage.hasDefault) {
      parts.unshift(`default as ${alias}_default`);
      shape.unshift(`default: ${alias}_default`);
    }

    imports.push(`import { ${parts.join(', ')} } from '${pkg}';`);
    members.push(`${key}: { ${shape.join(', ')} }`);
  });

  return `${imports.join('\n')}\n\nwindow.${bundle.global} = {\n  ${members.join(',\n  ')},\n};\n`;
}

function vendorEntryPlugin(bundle) {
  return {
    name: 'kelune-crm-vendor-entry',
    resolveId(id) {
      return id === VENDOR_ENTRY ? id : null;
    },
    load(id) {
      return id === VENDOR_ENTRY ? generateVendorEntry(bundle) : null;
    },
  };
}

// Lets a --watch rebuild restore what emptyOutDir removed without re-bundling.
// Invalidated when the generated entry changes.
const vendorOutputCache = new Map();

// Runs the vendor builds after the app build (the one that empties dist), so any
// single build command leaves all four scripts plus the stylesheet on disk.
function buildVendorsPlugin() {
  let configFile;

  return {
    name: 'kelune-crm-build-vendors',
    configResolved(config) {
      configFile = config.configFile;
    },
    async closeBundle() {
      for (const [mode, bundle] of Object.entries(vendorBundles)) {
        const file = path.resolve(
          __dirname,
          `dist/kelune-crm-admin-${mode}.js`
        );
        const entry = generateVendorEntry(bundle);
        const cached = vendorOutputCache.get(mode);

        if (cached && cached.entry === entry) {
          await writeFile(file, cached.code);
          continue;
        }

        const output = [await build({ configFile, mode })].flat()[0].output;

        // Nothing enqueues a vendor stylesheet, so fail loudly instead of
        // dropping it silently.
        if (output.some((o) => o.type === 'asset' && o.fileName.endsWith('.css'))) {
          this.error(
            `The ${mode} bundle emitted a stylesheet, which nothing enqueues. ` +
              'Move that import into the app bundle or enqueue the file.'
          );
        }

        vendorOutputCache.set(mode, {
          entry,
          code: output.find((o) => o.type === 'chunk').code,
        });
      }
    },
  };
}

// `mode` selects the bundle: default builds the app (plus the vendor scripts
// after it), each `vendorBundles` key builds only that one. NODE_ENV and
// minification are pinned so output is identical either way.
export default defineConfig(({ mode }) => {
  const vendor = vendorBundles[mode];
  const name = vendor ? `kelune-crm-admin-${mode}` : 'kelune-crm-admin';

  return {
    plugins: [
      react(),
      wrapInIife(), // last post-phase plugin, so it wraps the final code

      ...(vendor ? [vendorEntryPlugin(vendor)] : [buildVendorsPlugin()]),
    ],
    base: './',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    resolve: {
      alias: {
        // Routed to our shim over window.wp.i18n for wp_set_script_translations().
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
      outDir: path.resolve(__dirname, 'dist'),
      // Only the app build clears dist; the vendor builds run after it.
      emptyOutDir: !vendor,
      minify: true,
      chunkSizeWarningLimit: 3000,
      cssCodeSplit: false,
      rollupOptions: {
        input: vendor ? VENDOR_ENTRY : './src/main.tsx',
        external: vendor
          ? Object.keys(reactGlobals)
          : [...Object.keys(reactGlobals), ...Object.keys(appGlobals)],
        output: {
          format: 'iife',
          name: vendor ? vendor.global : 'KeluneCRMDashboard',
          inlineDynamicImports: true,
          globals: vendor ? reactGlobals : { ...reactGlobals, ...appGlobals },
          // Vendor globals are namespace objects; React's are plain UMD objects.
          interop: (id) => (id in appGlobals ? 'esModule' : 'default'),
          // Fixed names: PHP references them directly and cache-busts with ?ver=.
          // Emitted assets keep a hash — no ?ver= applies inside a bundle.
          entryFileNames: `${name}.js`,
          chunkFileNames: `${name}-[name].js`,
          assetFileNames: ({ name: assetName }) => {
            if (assetName && assetName.endsWith('.css')) {
              return `${name}.[ext]`;
            }

            return 'assets/[name].[hash].[ext]';
          },
        },
      },
    },
  };
});
