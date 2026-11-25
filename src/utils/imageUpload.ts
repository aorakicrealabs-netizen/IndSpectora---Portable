export const ACCEPTED_IMAGE_ACCEPT =
  'image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.heic,.heif';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
]);

export interface PreparedImageResult {
  file: File;
  originalBytes: number;
  finalBytes: number;
  wasOptimized: boolean;
  note: string;
}

export interface ParsedApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] ?? '' : '';
}

export function isSupportedImageFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (
    (!mime ||
      mime === 'application/octet-stream' ||
      mime === 'text/xml' ||
      mime === 'application/xml') &&
    SUPPORTED_IMAGE_EXTENSIONS.has(ext)
  ) {
    return true;
  }
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext);
}

function replaceFileExtension(fileName: string, nextExt: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  const base = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName || 'image';
  return `${base}.${nextExt}`;
}

async function decodeImageDimensions(
  blob: Blob
): Promise<{ width: number; height: number; source: CanvasImageSource; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement decoding below
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Browser could not decode this image file.'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      source: img,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

async function convertHeicToJpegBlob(file: File): Promise<Blob> {
  const heicModule = await import('heic2any');
  const heic2any = heicModule.default;
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!(blob instanceof Blob)) {
    throw new Error('Could not convert HEIC/HEIF photo into a browser-compatible image.');
  }
  return blob;
}

export async function prepareImageForUpload(
  inputFile: File,
  kind: 'drawing' | 'photo'
): Promise<PreparedImageResult> {
  if (!isSupportedImageFile(inputFile)) {
    throw new Error(
      `Unsupported file format (${inputFile.name}). Supported formats: PNG, JPG, WebP, SVG, GIF, and HEIC.`
    );
  }

  const originalBytes = inputFile.size;
  const ext = getFileExtension(inputFile.name);
  const mime = (inputFile.type || '').toLowerCase();

  // Preserve vector SVGs cleanly without rasterization
  if (ext === 'svg' || mime === 'image/svg+xml') {
    const text = await inputFile.text();
    if (!/<svg[\s>]/i.test(text)) {
      throw new Error('Selected SVG file does not contain a valid <svg> graphic.');
    }
    if (originalBytes > 15 * 1024 * 1024) {
      throw new Error('SVG schematic exceeds 15 MB. Please simplify or export a lighter SVG.');
    }
    const normalizedSvg =
      mime === 'image/svg+xml'
        ? inputFile
        : new File([inputFile], replaceFileExtension(inputFile.name, 'svg'), {
            type: 'image/svg+xml',
            lastModified: inputFile.lastModified,
          });
    return {
      file: normalizedSvg,
      originalBytes,
      finalBytes: normalizedSvg.size,
      wasOptimized: false,
      note: `SVG vector ready (${formatBytes(normalizedSvg.size)})`,
    };
  }

  let workingBlob: Blob = inputFile;
  let workingName = inputFile.name;
  let wasConvertedFromHeic = false;

  if (ext === 'heic' || ext === 'heif' || mime === 'image/heic' || mime === 'image/heif') {
    workingBlob = await convertHeicToJpegBlob(inputFile);
    workingName = replaceFileExtension(inputFile.name, 'jpg');
    wasConvertedFromHeic = true;
  }

  const targetMaxDim = kind === 'drawing' ? 2560 : 2048;
  const targetSoftBytes = kind === 'drawing' ? 2.4 * 1024 * 1024 : 1.6 * 1024 * 1024;
  const maxServerBytes = 24 * 1024 * 1024;

  // Keep small animated/static GIFs untouched unless oversized
  if (ext === 'gif' && !wasConvertedFromHeic && workingBlob.size <= 4 * 1024 * 1024) {
    const normalizedGif =
      mime === 'image/gif'
        ? inputFile
        : new File([inputFile], replaceFileExtension(inputFile.name, 'gif'), {
            type: 'image/gif',
            lastModified: inputFile.lastModified,
          });
    return {
      file: normalizedGif,
      originalBytes,
      finalBytes: normalizedGif.size,
      wasOptimized: false,
      note: `GIF ready (${formatBytes(normalizedGif.size)})`,
    };
  }

  let decoded: Awaited<ReturnType<typeof decodeImageDimensions>> | null = null;
  try {
    decoded = await decodeImageDimensions(workingBlob);
  } catch {
    // If browser cannot decode (rare exotic TIFF/BMP) and file is within limit, allow server check
    if (workingBlob.size <= maxServerBytes && !wasConvertedFromHeic) {
      const fallbackType = mime.startsWith('image/') ? mime : `image/${ext || 'jpeg'}`;
      const passthrough = new File([workingBlob], workingName, {
        type: fallbackType,
        lastModified: inputFile.lastModified,
      });
      return {
        file: passthrough,
        originalBytes,
        finalBytes: passthrough.size,
        wasOptimized: false,
        note: `${formatBytes(passthrough.size)}`,
      };
    }
    throw new Error(`Could not read image "${inputFile.name}". Try exporting as PNG, JPG, or WebP.`);
  }

  try {
    const needsResize = decoded.width > targetMaxDim || decoded.height > targetMaxDim;
    const needsCompression = workingBlob.size > targetSoftBytes;

    // Keep modest PNG/JPG/WebP files crisp without re-encoding if already within limits
    if (!needsResize && !needsCompression) {
      const normalizedMime = wasConvertedFromHeic
        ? 'image/jpeg'
        : mime.startsWith('image/')
          ? mime
          : `image/${ext === 'jpg' ? 'jpeg' : ext || 'png'}`;
      const finalFile =
        workingBlob instanceof File && workingBlob.type === normalizedMime
          ? workingBlob
          : new File([workingBlob], workingName, {
              type: normalizedMime,
              lastModified: inputFile.lastModified,
            });
      return {
        file: finalFile,
        originalBytes,
        finalBytes: finalFile.size,
        wasOptimized: wasConvertedFromHeic,
        note: wasConvertedFromHeic
          ? `Converted HEIC (${formatBytes(originalBytes)} → ${formatBytes(finalFile.size)})`
          : `${formatBytes(finalFile.size)}`,
      };
    }

    const scale = needsResize
      ? Math.min(targetMaxDim / decoded.width, targetMaxDim / decoded.height)
      : 1;
    const outW = Math.max(1, Math.round(decoded.width * scale));
    const outH = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to initialize image compression canvas.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, outW, outH);

    // Prefer WebP for drawings (preserves transparency & razor-sharp schematic edges) or JPEG fallback
    const preferWebp = ext === 'png' || ext === 'webp' || ext === 'bmp' || kind === 'drawing';
    const mimeCandidates = preferWebp ? ['image/webp', 'image/jpeg'] : ['image/jpeg', 'image/webp'];
    const qualities = kind === 'drawing' ? [0.9, 0.82, 0.72] : [0.85, 0.75, 0.65];

    let bestBlob: Blob | null = null;
    let chosenMime = mimeCandidates[0];

    for (const candidateMime of mimeCandidates) {
      for (const q of qualities) {
        const encoded = await canvasToBlob(canvas, candidateMime, q);
        if (!encoded) continue;
        bestBlob = encoded;
        chosenMime = candidateMime;
        if (encoded.size <= targetSoftBytes) break;
      }
      if (bestBlob) break;
    }

    if (!bestBlob) {
      throw new Error('Image compression failed in browser.');
    }

    // If original was not HEIC, wasn't resized, and re-encoding didn't shrink it, keep original
    if (!wasConvertedFromHeic && !needsResize && bestBlob.size >= workingBlob.size && workingBlob.size <= maxServerBytes) {
      const normalizedMime = mime.startsWith('image/')
        ? mime
        : `image/${ext === 'jpg' ? 'jpeg' : ext || 'png'}`;
      const originalWrapped = new File([workingBlob], workingName, {
        type: normalizedMime,
        lastModified: inputFile.lastModified,
      });
      return {
        file: originalWrapped,
        originalBytes,
        finalBytes: originalWrapped.size,
        wasOptimized: false,
        note: `${formatBytes(originalWrapped.size)}`,
      };
    }

    const outExt = chosenMime === 'image/webp' ? 'webp' : 'jpg';
    const compressedFile = new File([bestBlob], replaceFileExtension(inputFile.name, outExt), {
      type: chosenMime,
      lastModified: inputFile.lastModified,
    });

    if (compressedFile.size > maxServerBytes) {
      throw new Error(
        `Image is still ${formatBytes(compressedFile.size)} after compression (limit 24 MB). Please crop or resize it.`
      );
    }

    return {
      file: compressedFile,
      originalBytes,
      finalBytes: compressedFile.size,
      wasOptimized: true,
      note: wasConvertedFromHeic
        ? `Converted HEIC & optimized (${formatBytes(originalBytes)} → ${formatBytes(compressedFile.size)})`
        : `Optimized (${formatBytes(originalBytes)} → ${formatBytes(compressedFile.size)})`,
    };
  } finally {
    decoded.cleanup();
  }
}

export async function parseApiResponse<T>(res: Response): Promise<ParsedApiResponse<T>> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      errorMessage: res.ok ? null : `Upload failed (HTTP ${res.status}).`,
    };
  }

  let parsed: (T & { error?: string }) | null = null;
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(rawText) as T & { error?: string };
    } catch {
      parsed = null;
    }
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: parsed, errorMessage: null };
  }

  if (parsed?.error) {
    return { ok: false, status: res.status, data: parsed, errorMessage: parsed.error };
  }

  if (res.status === 413) {
    return {
      ok: false,
      status: 413,
      data: null,
      errorMessage: 'Image payload was too large for the server proxy (HTTP 413). Try a smaller or lower-resolution image.',
    };
  }

  return {
    ok: false,
    status: res.status,
    data: parsed,
    errorMessage: `Server rejected the upload (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}).`,
  };
}
