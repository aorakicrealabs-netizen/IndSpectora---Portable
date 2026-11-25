/**
 * IndSpectora — Chunked Windows Portable Executable Downloader
 * Fetches 6 MB chunks over same-origin authenticated requests so downloads bypass
 * reverse-proxy size caps and never silently save proxy HTML challenge pages.
 */

export interface PortableDownloadProgress {
  percent: number;
  loadedMB: string;
  totalMB: string;
}

export interface PortableManifest {
  available: boolean;
  filename: string;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
}

export async function downloadPortableWindowsExe(
  onProgress?: (progress: PortableDownloadProgress) => void,
  authToken?: string
): Promise<{ ok: boolean; isProxyBlocked?: boolean; error?: string }> {
  try {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const manifestRes = await fetch('/api/portable/manifest', {
      headers,
      cache: 'no-store',
    });
    const manifestType = manifestRes.headers.get('content-type') || '';
    const manifestText = await manifestRes.text();

    if (!manifestType.includes('application/json')) {
      const lower = manifestText.toLowerCase();
      const isChallenge =
        lower.includes('blocking a required security cookie') ||
        lower.includes('action required to load your app');
      return {
        ok: false,
        isProxyBlocked: true,
        error: isChallenge
          ? 'Your browser blocked the preview iframe security cookie. Click "Open App in New Tab" below and download from the standalone tab.'
          : 'Unexpected proxy response while checking portable .exe manifest. Open the app in a new tab and try again.',
      };
    }

    const manifest = JSON.parse(manifestText) as PortableManifest;
    if (!manifestRes.ok || !manifest.available || manifest.totalChunks <= 0) {
      return {
        ok: false,
        error: 'Portable Windows .exe has not been built on the server yet (run npm run build:portable).',
      };
    }

    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;
    const totalMB = (manifest.sizeBytes / (1024 * 1024)).toFixed(1);

    for (let i = 0; i < manifest.totalChunks; i += 1) {
      const chunkRes = await fetch(`/api/portable/chunk/${i}`, {
        headers,
        cache: 'no-store',
      });
      const chunkType = chunkRes.headers.get('content-type') || '';
      if (!chunkRes.ok || chunkType.includes('text/html')) {
        return {
          ok: false,
          isProxyBlocked: true,
          error:
            'Preview proxy interrupted chunk transfer. Click "Open App in New Tab" below and download from the standalone tab.',
        };
      }
      const buf = new Uint8Array(await chunkRes.arrayBuffer());
      if (i === 0 && (buf.length < 2 || buf[0] !== 0x4d || buf[1] !== 0x5a)) {
        return {
          ok: false,
          isProxyBlocked: true,
          error:
            'Downloaded header is not a valid Windows PE (.exe) binary. Open the app in a new tab and try again.',
        };
      }
      chunks.push(buf);
      loadedBytes += buf.length;
      onProgress?.({
        percent: Math.min(100, Math.round((loadedBytes / manifest.sizeBytes) * 100)),
        loadedMB: (loadedBytes / (1024 * 1024)).toFixed(1),
        totalMB,
      });
    }

    const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = manifest.filename || 'IndSpectora-Portable.exe';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Network error while downloading IndSpectora-Portable.exe.',
    };
  }
}
