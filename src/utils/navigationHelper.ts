import { Linking, Platform } from 'react-native';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Safely extracts latitude and longitude from multiple possible backend field formats:
 * - Separate numerical fields: pickupLat / pickupLng, pickup_lat / pickup_lng
 * - String numbers: "17.4504", "78.3811"
 * - Combined comma-separated strings: "17.4504, 78.3811"
 * - Nested objects: { lat: 17.4504, lng: 78.3811 }
 */
export const resolveCoordinates = (
  latVal?: any,
  lngVal?: any,
  rawFallbackStr?: any
): Coordinates => {
  let lat = 0;
  let lng = 0;

  if (typeof latVal === 'number' && !isNaN(latVal)) lat = latVal;
  else if (typeof latVal === 'string' && latVal.trim()) lat = parseFloat(latVal.trim()) || 0;

  if (typeof lngVal === 'number' && !isNaN(lngVal)) lng = lngVal;
  else if (typeof lngVal === 'string' && lngVal.trim()) lng = parseFloat(lngVal.trim()) || 0;

  // Fallback: check if rawFallbackStr is an object with lat/lng
  if ((!lat || !lng) && typeof rawFallbackStr === 'object' && rawFallbackStr !== null) {
    const objLat = rawFallbackStr.lat ?? rawFallbackStr.latitude;
    const objLng = rawFallbackStr.lng ?? rawFallbackStr.longitude;
    if (objLat) lat = parseFloat(String(objLat)) || lat;
    if (objLng) lng = parseFloat(String(objLng)) || lng;
  }

  // Fallback: check if rawFallbackStr is "17.4504, 78.3811"
  if ((!lat || !lng) && typeof rawFallbackStr === 'string' && rawFallbackStr.includes(',')) {
    const parts = rawFallbackStr.split(',').map((p: string) => parseFloat(p.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] !== 0) {
      lat = parts[0];
      lng = parts[1];
    }
  }

  return { lat, lng };
};

/**
 * Launches Turn-by-Turn GPS Driving Navigation to exact coordinates.
 * Follows the official Porter Driver App Navigation Guide:
 * - Android: google.navigation:q=${lat},${lng}&mode=d (turn-by-turn driving mode)
 *   Fallback: https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving
 * - iOS: comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving
 *   Fallback: maps://app?daddr=${lat},${lng}&dirflg=d
 * - Graceful fallback to address search if coordinates are missing.
 */
export const launchTurnByTurnNavigation = (
  coords?: Partial<Coordinates> | null,
  fallbackAddress: string = 'Destination'
): void => {
  const lat = Number(coords?.lat ?? 0);
  const lng = Number(coords?.lng ?? 0);
  const hasValidCoords = lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng);

  if (Platform.OS === 'android') {
    if (hasValidCoords) {
      const googleNavUrl = `google.navigation:q=${lat},${lng}&mode=d`;
      const webMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

      Linking.openURL(googleNavUrl).catch(() => {
        Linking.openURL(webMapsUrl).catch(() => {});
      });
    } else {
      const encodedAddr = encodeURIComponent(fallbackAddress || 'Destination');
      const googleNavAddrUrl = `google.navigation:q=${encodedAddr}&mode=d`;
      const webMapsAddrUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddr}`;

      Linking.openURL(googleNavAddrUrl).catch(() => {
        Linking.openURL(webMapsAddrUrl).catch(() => {});
      });
    }
  } else {
    // iOS (Google Maps app or Apple Maps)
    if (hasValidCoords) {
      const googleMapsIosUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
      const appleMapsUrl = `maps://app?daddr=${lat},${lng}&dirflg=d`;

      Linking.canOpenURL(googleMapsIosUrl)
        .then((supported) => {
          if (supported) {
            Linking.openURL(googleMapsIosUrl).catch(() => Linking.openURL(appleMapsUrl).catch(() => {}));
          } else {
            Linking.openURL(appleMapsUrl).catch(() => {});
          }
        })
        .catch(() => {
          Linking.openURL(appleMapsUrl).catch(() => {});
        });
    } else {
      const encodedAddr = encodeURIComponent(fallbackAddress || 'Destination');
      const googleMapsIosUrl = `comgooglemaps://?daddr=${encodedAddr}&directionsmode=driving`;
      const appleMapsUrl = `maps://app?daddr=${encodedAddr}&dirflg=d`;

      Linking.canOpenURL(googleMapsIosUrl)
        .then((supported) => {
          if (supported) {
            Linking.openURL(googleMapsIosUrl).catch(() => Linking.openURL(appleMapsUrl).catch(() => {}));
          } else {
            Linking.openURL(appleMapsUrl).catch(() => {});
          }
        })
        .catch(() => {
          Linking.openURL(appleMapsUrl).catch(() => {});
        });
    }
  }
};

/**
 * Calculates straight-line distance in kilometers between two GPS coordinates using Haversine formula.
 */
export const calculateDistanceKm = (
  lat1?: number,
  lng1?: number,
  lat2?: number,
  lng2?: number
): number => {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
