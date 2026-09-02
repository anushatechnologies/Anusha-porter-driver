const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.anushaporter.com';

// Centralized URL sanitisation helper used across the app.
// Ensures local URIs (file://, data:) are preserved intact when valid.
// Fixes relative paths, duplicate protocols, and S3 regional endpoints.
export const cleanUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  let str = String(url).trim();
  if (!str || str === 'null' || str === 'undefined') return '';

  try {
    // 1. Preserve local base64 / blob / content URIs
    if (
      str.startsWith('data:') ||
      str.startsWith('content://') ||
      str.startsWith('ph://') ||
      str.startsWith('blob:')
    ) {
      return str;
    }

    // 2. Fix double/nested protocols: "https://api.anushaporter.comhttps://poteranusha.s3..." or "undefinedhttps://..."
    if (str.includes('http://') || str.includes('https://')) {
      const lastHttpIndex = Math.max(str.lastIndexOf('https://'), str.lastIndexOf('http://'));
      if (lastHttpIndex > 0) {
        str = str.substring(lastHttpIndex);
      }
    } else if (str.startsWith('file:/')) {
      return str.startsWith('file://') ? str : `file://${str.replace(/^file:\/+/, '')}`;
    } else if (str.startsWith('/data/') || str.startsWith('/storage/')) {
      return `file://${str}`;
    } else if (str.startsWith('/')) {
      str = `${BASE_URL}${str}`;
    } else {
      str = `${BASE_URL}/${str}`;
    }

    // 3. Resolve non-regional or misconfigured S3 URLs to AWS ap-south-2 (Hyderabad)
    if (str.includes('poteranusha.s3.amazonaws.com') && !str.includes('ap-south-2')) {
      str = str.replace('poteranusha.s3.amazonaws.com', 'poteranusha.s3.ap-south-2.amazonaws.com');
    }
    if (str.includes('s3.ap-south-1.amazonaws.com/poteranusha')) {
      str = str.replace('s3.ap-south-1.amazonaws.com/poteranusha', 'poteranusha.s3.ap-south-2.amazonaws.com');
    }

    return str;
  } catch (e) {
    console.warn('Failed to clean URL', e);
    return str;
  }
};
