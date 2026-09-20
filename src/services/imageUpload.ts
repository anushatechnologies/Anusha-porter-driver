import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { authFetch } from './api';
import { cleanUrl } from '../utils/urlHelpers';

/**
 * Upload a local image URI to the backend and return the persistent server URL.
 *
 * On web: expo-image-picker returns a blob: URI.  We fetch it, convert to a Blob,
 *         and POST it as multipart/form-data to our backend.
 * On native: we use fetch with the file URI directly.
 *
 * Returns the server-hosted URL (e.g. /api/upload/files/profile/uuid.jpg),
 * or null if upload fails.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.anushaporter.com';

export const uploadImageToBackend = async (
  localUri: string,
  category: 'profile' | 'aadhaar' | 'pan' | 'license' | 'rc' | 'bankpassbook' | 'misc' = 'misc'
): Promise<string | null> => {
  try {
    const backendUrl = `${BASE_URL}/api/upload/image`;

    let body: FormData;

    if (Platform.OS === 'web') {
      // On web, localUri is a blob: URL — fetch the blob first
      const blobRes = await fetch(localUri);
      const blob = await blobRes.blob();
      // Determine extension from blob type
      const ext = blob.type.includes('png') ? '.png' : blob.type.includes('gif') ? '.gif' : '.jpg';
      const file = new File([blob], `upload${ext}`, { type: blob.type });
      body = new FormData();
      body.append('file', file);
      body.append('category', category);
    } else {
      // On native, use the file URI directly
      const filename = localUri.split('/').pop() || 'upload.jpg';
      const match = /\.(\w+)$/.exec(filename);
      // Normalise extension: lowercase and map 'jpg' → 'jpeg' for a valid MIME type
      const rawExt = (match?.[1] || 'jpeg').toLowerCase();
      const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
      const type = `image/${ext}`;
      body = new FormData();
      body.append('file', { uri: localUri, name: filename, type } as any);
      body.append('category', category);
    }

    const uploadRoutes = [`${BASE_URL}/api/upload`, `${BASE_URL}/api/upload/image`];
    for (const backendUrl of uploadRoutes) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
        const res = await authFetch(backendUrl, { method: 'POST', body, signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          let url = data.url || data.fileUrl || data.path || data.imageUrl || data.s3Url || '';
          if (url) return cleanUrl(url);
        }
      } catch (err) {
        // try next endpoint
      }
    }
    return null;
  } catch (e) {
    console.warn('uploadImageToBackend error:', e);
    return null;
  }
};

export { uploadAndVerifyDocument, DocumentUploadResponse } from './documentService';
