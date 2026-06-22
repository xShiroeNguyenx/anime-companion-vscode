import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// Mirrors image-encoder's MAX_BYTES — the downloaded image is later embedded as
// a data-URI into workbench.desktop.main.js, so it must stay small enough not to
// bloat VS Code startup. Refuse anything bigger up front instead of downloading
// megabytes only to reject them at Apply time.
const MAX_IMAGE_BYTES = 2_500_000; // ~2.4 MB
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

// Extension chosen for the saved file based on the sniffed MIME. Kept in sync
// with image-encoder's MIME_BY_EXT so the encoder accepts whatever we save.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
};

export interface DownloadedImage {
  buf: Buffer;
  /** Sniffed MIME, e.g. 'image/png'. */
  mime: string;
  /** File extension to save with, including the dot, e.g. '.png'. */
  ext: string;
}

/**
 * Turn a share link from common services into a direct-download URL.
 * Supports Google Drive (file/d/<id> and ?id=<id>) and Dropbox (?dl=1).
 * Other URLs are returned trimmed but unchanged.
 */
export function normalizeImageUrl(raw: string): string {
  const url = raw.trim();

  // https://drive.google.com/file/d/<ID>/view?... → uc?export=download&id=<ID>
  const driveFile = /drive\.google\.com\/file\/d\/([^/?#]+)/.exec(url);
  if (driveFile) return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`;

  // https://drive.google.com/open?id=<ID> | .../uc?id=<ID> | any ?id=<ID>
  const driveId = /drive\.google\.com\/[^?#]*[?&]id=([^&#]+)/.exec(url);
  if (driveId) return `https://drive.google.com/uc?export=download&id=${driveId[1]}`;

  // Dropbox — force the real file instead of the preview page.
  if (/dropbox\.com\//.test(url)) {
    if (/[?&]dl=1\b/.test(url)) return url;
    if (/[?&]dl=0\b/.test(url)) return url.replace(/([?&])dl=0\b/, '$1dl=1');
    return url + (url.includes('?') ? '&dl=1' : '?dl=1');
  }

  return url;
}

/** Detect the image type from the leading bytes — never trust Content-Type. */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  // SVG is text — sniff the markup (skip a leading BOM / whitespace).
  const head = buf.subarray(0, 256).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<?xml') ? head.includes('<svg') : head.startsWith('<svg')) return 'image/svg+xml';
  return null;
}

/**
 * Download an image from a (possibly share-link) URL into memory.
 * Validates the protocol, follows redirects, caps the size, and sniffs the type
 * so we only ever save real images. Throws a user-readable Error on failure.
 */
export async function downloadImage(rawUrl: string): Promise<DownloadedImage> {
  const normalized = normalizeImageUrl(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('URL không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ link http/https.');
  }

  const { buf, contentType } = await fetchToBuffer(normalized);

  // Google Drive serves an HTML page (sign-in / virus-scan confirm) when a file
  // isn't publicly shared — catch that before we try to sniff it as an image.
  if (contentType.startsWith('text/html')) {
    throw new Error('Link không trỏ thẳng tới ảnh (file có thể chưa được chia sẻ công khai).');
  }

  const sniffed = sniffImageMime(buf);
  const mime = sniffed ?? (contentType.startsWith('image/') ? contentType.split(';')[0].trim() : null);
  if (!mime || !EXT_BY_MIME[mime]) {
    throw new Error('Nội dung tải về không phải là ảnh được hỗ trợ (png, jpg, webp, gif, bmp, svg).');
  }

  return { buf, mime, ext: EXT_BY_MIME[mime] };
}

function fetchToBuffer(
  url: string,
  redirectsLeft = MAX_REDIRECTS,
): Promise<{ buf: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;

    const req = lib.get(
      u,
      // A browser-like UA — some hosts (incl. Google Drive) gate on it.
      { headers: { 'User-Agent': 'Mozilla/5.0 AnimeCompanion', Accept: 'image/*,*/*' } },
      (res) => {
        const status = res.statusCode ?? 0;

        // Google Drive redirects to googleusercontent — follow like GitHub→S3.
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          if (redirectsLeft <= 0) {
            res.resume();
            reject(new Error('Quá nhiều lần chuyển hướng.'));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          fetchToBuffer(next, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Tải ảnh thất bại (HTTP ${status}).`));
          return;
        }

        const declared = Number.parseInt(String(res.headers['content-length'] ?? '0'), 10) || 0;
        if (declared > MAX_IMAGE_BYTES) {
          res.resume();
          reject(new Error(`Ảnh quá lớn (> ${(MAX_IMAGE_BYTES / 1_000_000).toFixed(1)} MB).`));
          return;
        }

        const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
        const chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_IMAGE_BYTES) {
            req.destroy(new Error(`Ảnh quá lớn (> ${(MAX_IMAGE_BYTES / 1_000_000).toFixed(1)} MB).`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ buf: Buffer.concat(chunks), contentType }));
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error('Tải ảnh quá lâu (timeout).'));
    });
  });
}
