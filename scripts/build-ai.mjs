// Bundelt de rekenfuncties van tick. voor de AI-koppeling (MCP) tot één Node-bestand.
// React, de browser-API en DOMPurify worden vervangen door Node-varianten; happy-dom levert de DOM.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ai = path.join(root, 'server', 'ai');

const swap = {
  name: 'tick-swap',
  setup(b) {
    b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, () => ({ path: path.join(ai, 'react-stub.js') }));
    b.onResolve({ filter: /^dompurify$/ }, () => ({ path: path.join(ai, 'purify-stub.js') }));
    b.onResolve({ filter: /\/api\.js$/ }, (a) => (a.importer.includes(`${path.sep}web${path.sep}`) ? { path: path.join(ai, 'node-api.js') } : undefined));
    b.onResolve({ filter: /\/store\.jsx$/ }, () => ({ path: path.join(ai, 'store-stub.js') }));
  },
};

await build({
  entryPoints: [path.join(ai, 'entry.js')],
  outfile: path.join(ai, 'tick-ai.bundle.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: true,
  legalComments: 'none',
  jsx: 'automatic',
  plugins: [swap],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.log('  AI-bundel gebouwd: server/ai/tick-ai.bundle.mjs');
