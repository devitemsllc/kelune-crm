/**
 * Generate languages/kelune-crm.pot from BOTH the PHP source and the
 * React/TypeScript dashboard.
 *
 * `wp i18n make-pot` cannot parse TypeScript, so the dashboard is transpiled to
 * plain JS in a throwaway mirror, extracted from there, its references rewritten
 * back to the real .ts/.tsx paths, then merged into the PHP catalog.
 *
 * Transpiling uses tsc with `removeComments: false` (not esbuild) so
 * `// translators:` hints survive for make-pot to read.
 *
 * Run from assets/admin: `yarn i18n:pot`. Requires WP-CLI on PATH.
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const DASH = path.resolve(fileURLToPath(import.meta.url), '..'); // assets/admin
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

/** Point the mirror's `.jsx` references back at the real `.ts`/`.tsx` sources. */
async function fixReferences() {
  let pot = await fs.readFile(JS_POT, 'utf8');
  pot = pot.replace(/#: ([^\s:]+)\.jsx:(\d+)/g, (_m, rel, line) => {
    const tsx = path.join(SRC, `${rel}.tsx`);
    const ext = existsSync(tsx) ? 'tsx' : 'ts';
    return `#: assets/admin/src/${rel}.${ext}:${line}`;
  });
  await fs.writeFile(JS_POT, pot);
}

const count = await transpile();
console.log(`Transpiled ${count} TS files for extraction.`);

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

// Extract the PHP strings and merge the dashboard catalog in.
wp(
  [
    'i18n',
    'make-pot',
    '.',
    'languages/kelune-crm.pot',
    `--domain=${DOMAIN}`,
    '--exclude=dev-tools,node_modules,assets,libs,blueprint,dev-files,build,dist',
    `--merge=${path.relative(PLUGIN, JS_POT)}`,
  ],
  PLUGIN
);

await fs.rm(TMP, { recursive: true, force: true });
console.log(`\nDone → ${path.relative(PLUGIN, OUT_POT)}`);
