const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.anushaporter.com';

// Centralized URL sanitisation helper used across the app.
// Ensures local URIs (file://, data:) are preserved intact.
// Fixes relative paths, duplicate protocols, and S3 regional endpoints.
export const cleanUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  let str = String(url).trim();
  if (!str) return '';

  try {
    // Preserve local file URIs and base64 data URIs intact for React Native Image rendering
    if (str.startsWith('data:') || str.startsWith('file://')) {
      return str;
    }

    // Fix duplicate protocol prefixes like "https://https://..." or "undefinedhttps://..."
    if (str.includes('http://') || str.includes('https://')) {
      const lastHttpIndex = Math.max(str.lastIndexOf('https://'), str.lastIndexOf('http://'));
      if (lastHttpIndex !== -1) {
        str = str.substring(lastHttpIndex);
      }
    } else if (str.startsWith('/')) {
      str = `${BASE_URL}${str}`;
    } else {
      str = `${BASE_URL}/${str}`;
    }

    // Resolve non-regional S3 URLs to ap-south-2
    if (str.includes('poteranusha.s3.amazonaws.com')) {
      str = str.replace('poteranusha.s3.amazonaws.com', 'poteranusha.s3.ap-south-2.amazonaws.com');
    }

    return str;
  } catch (e) {
    console.warn('Failed to clean URL', e);
    return str;
  }
};

