import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SRC_ADMIN_FILE = path.join(PUBLIC, 'js', 'admin.js');
const SRC_ADMIN_DIR = path.join(PUBLIC, 'js', 'admin');
const OUT_DIR = path.join(PUBLIC, 'js', 'admin-obf');

const options = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: true,
  disableConsoleOutput: true,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  renameGlobals: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 7,
  target: 'browser'
};

async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function obfuscateFile(srcPath, outPath) {
  const code = await fs.readFile(srcPath, 'utf-8');
  const result = JavaScriptObfuscator.obfuscate(code, options);
  await ensureDir(path.dirname(outPath));
  await fs.writeFile(outPath, result.getObfuscatedCode(), 'utf-8');
}

async function walkAndObfuscate(srcRoot, rel = '') {
  const dir = path.join(srcRoot, rel);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      await walkAndObfuscate(srcRoot, path.join(rel, e.name));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      const srcPath = path.join(srcRoot, rel, e.name);
      const outPath = path.join(OUT_DIR, rel, e.name);
      await obfuscateFile(srcPath, outPath);
      process.stdout.write(`Obfuscated: ${path.join(rel, e.name)}\n`);
    }
  }
}

(async () => {
  let count = 0;
  if (await fileExists(SRC_ADMIN_FILE)) {
    await obfuscateFile(SRC_ADMIN_FILE, path.join(OUT_DIR, 'admin.js'));
    count++;
  }
  if (await fileExists(SRC_ADMIN_DIR)) {
    await walkAndObfuscate(SRC_ADMIN_DIR);
  }
  console.log(`Admin obfuscation completed. Wrote to ${OUT_DIR}`);
})().catch(err => {
  console.error('Obfuscation failed:', err);
  process.exit(1);
});
