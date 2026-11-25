/**
 * IndSpectora — Runtime path helpers for standard Node.js vs Portable SEA .exe mode
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

interface SeaApi {
  isSea(): boolean;
  getRawAsset(key: string): ArrayBuffer;
}

const require = createRequire(
  typeof __filename !== 'undefined' ? __filename : import.meta.url
);

let cachedSea: SeaApi | null | undefined;
function getSeaApi(): SeaApi | null {
  if (cachedSea !== undefined) return cachedSea;
  try {
    const mod = require('node:sea') as SeaApi;
    cachedSea = typeof mod?.isSea === 'function' ? mod : null;
  } catch {
    cachedSea = null;
  }
  return cachedSea;
}

export function isPortableExeRuntime(): boolean {
  if (process.env.INDSPECTORA_PORTABLE_EXE === '1') return true;
  const sea = getSeaApi();
  return Boolean(sea?.isSea());
}

export function getAppBaseDir(): string {
  const sea = getSeaApi();
  if (sea?.isSea()) {
    return path.dirname(process.execPath);
  }
  return process.cwd();
}

export function getDataDir(): string {
  const custom = process.env.INDSPECTORA_DATA_DIR?.trim();
  if (custom) {
    return path.resolve(custom);
  }
  return path.join(getAppBaseDir(), 'data');
}

export function readSeaAssetBuffer(assetKey: string): Buffer | null {
  const sea = getSeaApi();
  if (!sea?.isSea()) return null;
  try {
    const ab = sea.getRawAsset(assetKey);
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export function getPortableExecutablePath(): string {
  return path.resolve(process.cwd(), 'dist-portable', 'IndSpectora-Portable.exe');
}

export function isPortableExecutableReady(): boolean {
  return fs.existsSync(getPortableExecutablePath());
}
