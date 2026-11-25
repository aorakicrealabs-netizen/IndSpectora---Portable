import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const NODE_WIN_VERSION = 'v22.23.5';
const NODE_WIN_ZIP_NAME = `node-${NODE_WIN_VERSION}-win-x64.zip`;
const NODE_WIN_ZIP_URL = `https://nodejs.org/dist/${NODE_WIN_VERSION}/${NODE_WIN_ZIP_NAME}`;

const cacheDir = path.join(rootDir, '.portable-cache');
const tmpDir = path.join(rootDir, '.portable-tmp');
const outDir = path.join(rootDir, 'dist-portable');
const distDir = path.join(rootDir, 'dist');
const cachedWinExe = path.join(cacheDir, `node-${NODE_WIN_VERSION}-win-x64.exe`);
const outExe = path.join(outDir, 'IndSpectora-Portable.exe');

function collectFilesRecursive(dir, basePrefix = '') {
  const results = {};
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    const relKey = basePrefix ? `${basePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(results, collectFilesRecursive(absPath, relKey));
    } else if (entry.isFile()) {
      results[relKey] = absPath;
    }
  }
  return results;
}

function ensureWindowsNodeBinary() {
  if (fs.existsSync(cachedWinExe) && fs.statSync(cachedWinExe).size > 20_000_000) {
    console.log(`Using cached Windows Node ${NODE_WIN_VERSION} binary: ${cachedWinExe}`);
    return;
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, NODE_WIN_ZIP_NAME);
  console.log(`Downloading official Node.js ${NODE_WIN_VERSION} (win-x64) from nodejs.org...`);
  execFileSync('curl', ['-fSL', '--retry', '3', '-o', zipPath, NODE_WIN_ZIP_URL], {
    stdio: 'inherit',
  });

  console.log('Extracting node.exe from Windows archive...');
  const entryPath = `node-${NODE_WIN_VERSION}-win-x64/node.exe`;
  const exeBuf = execFileSync('unzip', ['-p', zipPath, entryPath], {
    maxBuffer: 150 * 1024 * 1024,
  });
  fs.writeFileSync(cachedWinExe, exeBuf);
  fs.rmSync(zipPath, { force: true });
  const mb = (exeBuf.length / (1024 * 1024)).toFixed(2);
  console.log(`Cached clean Windows node.exe (${mb} MB).`);
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log('1/5 Building React frontend (dist/)...');
  execFileSync('npm', ['run', 'build'], { cwd: rootDir, stdio: 'inherit' });

  console.log('2/5 Preparing Windows x64 Node.js runtime...');
  ensureWindowsNodeBinary();

  console.log('3/5 Bundling IndSpectora Express + SQLite backend...');
  const serverBundlePath = path.join(tmpDir, 'portable-server.cjs');
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'server', 'portableEntry.ts')],
    outfile: serverBundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    minify: true,
    alias: {
      'better-sqlite3': path.join(rootDir, 'server', 'sqliteCompat.ts'),
    },
    external: ['vite', 'node:sqlite', 'node:sea'],
    logLevel: 'warning',
  });

  console.log('4/5 Generating Node.js Single Executable (SEA) resource blob...');
  const assets = collectFilesRecursive(distDir, 'dist');
  const rootFavicon = path.join(rootDir, 'favicon.ico');
  if (!assets['dist/favicon.ico'] && fs.existsSync(rootFavicon)) {
    assets['dist/favicon.ico'] = rootFavicon;
  }

  const blobPath = path.join(tmpDir, 'sea-prep.blob');
  const seaConfigPath = path.join(tmpDir, 'sea-config.json');
  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: serverBundlePath,
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
        assets,
      },
      null,
      2
    ),
    'utf8'
  );

  execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  console.log('5/5 Injecting SEA blob into IndSpectora-Portable.exe...');
  fs.copyFileSync(cachedWinExe, outExe);
  const postjectBin = path.join(rootDir, 'node_modules', '.bin', 'postject');
  execFileSync(
    postjectBin,
    [
      outExe,
      'NODE_SEA_BLOB',
      blobPath,
      '--sentinel-fuse',
      'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ],
    {
      cwd: rootDir,
      stdio: 'inherit',
    }
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  const sizeMb = (fs.statSync(outExe).size / (1024 * 1024)).toFixed(2);
  console.log(`Generated ${outExe} (${sizeMb} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
