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

/**
 * Safely normalises any location/address input into a clean string.
 * Prevents React child object crashes when backend sends location objects like:
 * { lat: 17.44, addressLine: "Madhapur...", lng: 78.39 }
 */
export const formatAddressString = (addr: any, fallbackText: string = 'Location'): string => {
  if (!addr) return fallbackText;
  if (typeof addr === 'string') {
    const trimmed = addr.trim();
    return (trimmed && trimmed !== 'null' && trimmed !== 'undefined') ? trimmed : fallbackText;
  }
  if (typeof addr === 'object') {
    if (typeof addr.addressLine === 'string' && addr.addressLine.trim()) return addr.addressLine.trim();
    if (typeof addr.addressLine1 === 'string' && addr.addressLine1.trim()) return addr.addressLine1.trim();
    if (typeof addr.address === 'string' && addr.address.trim()) return addr.address.trim();
    if (typeof addr.name === 'string' && addr.name.trim()) return addr.name.trim();
    if (typeof addr.formattedAddress === 'string' && addr.formattedAddress.trim()) return addr.formattedAddress.trim();
    if (typeof addr.locationName === 'string' && addr.locationName.trim()) return addr.locationName.trim();
    if (typeof addr.pickupAddress === 'string' && addr.pickupAddress.trim()) return addr.pickupAddress.trim();
    if (typeof addr.dropAddress === 'string' && addr.dropAddress.trim()) return addr.dropAddress.trim();
    if (addr.lat !== undefined && addr.lng !== undefined) {
      return `Lat: ${Number(addr.lat).toFixed(4)}, Lng: ${Number(addr.lng).toFixed(4)}`;
    }
  }
  return fallbackText;
};
