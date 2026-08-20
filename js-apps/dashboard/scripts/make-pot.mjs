/**
 * Generate the plugin translation template (languages/kelune-crm.pot)
 * covering BOTH the PHP source and the React/TypeScript dashboard.
 *
 * Why this script exists: `wp i18n make-pot` cannot parse TypeScript (.ts/.tsx),
 * so it silently extracts nothing from the dashboard. We transpile the dashboard
 * sources to plain JS (types stripped, JSX + every __()/_n() call preserved) into
 * a throwaway mirror, run make-pot over that mirror for the JS strings, rewrite
 * the references back to the real .ts/.tsx paths, then run make-pot over the
 * plugin PHP and --merge the JS catalog in.
 *
 * Transpilation uses the TypeScript compiler with `removeComments: false` (NOT
 * esbuild) specifically so `// translators:` comments survive into the mirror —
 * make-pot reads them to annotate placeholder strings. esbuild strips comments
 * inconsistently (e.g. inside switch/case), which silently loses those hints.
 *
 * Run from the dashboard dir:  yarn i18n:pot
 * Requires: WP-CLI (`wp`) on PATH, typescript (a dev dependency).
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const DASH = path.resolve(fileURLToPath(import.meta.url), '../..'); // js-apps/dashboard
const PLUGIN = path.resolve(DASH, '../..'); // plugin root
const SRC = path.join(DASH, 'src');
const TMP = path.join(DASH, '.i18n-tmp');
const TMP_SRC = path.join(TMP, 'src');
const JS_POT = path.join(TMP, 'dashboard.pot');
const OUT_POT = path.join(PLUGIN, 'languages', 'kelune-crm.pot');
const DOMAIN = 'kelune-crm';

async function collect(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collect(p)));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

async function transpile() {
  await fs.rm(TMP, { recursive: true, force: true });
  const files = await collect(SRC);
  for (const file of files) {
    const code = await fs.readFile(file, 'utf8');
    const { outputText } = ts.transpileModule(code, {
      fileName: file,
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve, // keep JSX — make-pot's JS parser handles it
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        removeComments: false, // keep `// translators:` hints for make-pot
        isolatedModules: true,
      },
    });
    const rel = path.relative(SRC, file).replace(/\.tsx?$/, '.jsx');
    const dest = path.join(TMP_SRC, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, outputText);
  }
  return files.length;
}

function wp(args, cwd) {
  execFileSync('wp', args, { cwd, stdio: 'inherit' });
}

/**
 * Rewrite the transpiled `<rel>.jsx` refs (relative to the temp mirror) back to
 * the real `js-apps/dashboard/src/<rel>.tsx|ts` source paths. Only `.jsx` refs
 * match, so PHP `.php` references are untouched.
 */
async function fixReferences() {
  let pot = await fs.readFile(JS_POT, 'utf8');
  pot = pot.replace(/#: ([^\s:]+)\.jsx:(\d+)/g, (_m, rel, line) => {
    const tsx = path.join(SRC, `${rel}.tsx`);
    const ext = existsSync(tsx) ? 'tsx' : 'ts';
    return `#: js-apps/dashboard/src/${rel}.${ext}:${line}`;
  });
  await fs.writeFile(JS_POT, pot);
}

const count = await transpile();
console.log(`Transpiled ${count} TS files for extraction.`);

// 1) Extract JS strings from the transpiled mirror.
wp(
  [
    'i18n',
    'make-pot',
    '.i18n-tmp/src',
    path.relative(DASH, JS_POT),
    `--domain=${DOMAIN}`,
    '--skip-audit',
  ],
  DASH
);
await fixReferences();

// 2) Extract PHP strings from the plugin and merge the JS catalog in.
wp(
  [
    'i18n',
    'make-pot',
    '.',
    'languages/kelune-crm.pot',
    `--domain=${DOMAIN}`,
    '--exclude=dev-tools,node_modules,assets,libs,js-apps,blueprint,dev-files,build,dist',
    `--merge=${path.relative(PLUGIN, JS_POT)}`,
  ],
  PLUGIN
);

await fs.rm(TMP, { recursive: true, force: true });
console.log(`\nDone → ${path.relative(PLUGIN, OUT_POT)}`);
