// Builds dist/borrowed-gravity.html: one self-contained file (JS + CSS inlined)
// that runs straight from disk — no server needed.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const res = await build({
  entryPoints: [new URL('src/main.js', root).pathname],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(new URL('web/style.css', root), 'utf8');
let html = await readFile(new URL('web/index.html', root), 'utf8');
html = html
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="bundle.js"></script>', () => `<script>\n${js}</script>`);
await mkdir(new URL('dist/', root), { recursive: true });
const out = new URL('dist/borrowed-gravity.html', root);
await writeFile(out, html);
console.log(`built ${out.pathname} (${(html.length / 1024).toFixed(0)} KB)`);
