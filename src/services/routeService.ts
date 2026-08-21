/**
 * Google Routes API & ETA Calculation Service
 * Provides real-time two-wheeler route distance and travel duration for Anusha Porter Driver App.
 */

const GOOGLE_MAPS_API_KEY = 'AIzaSyBMZfGGMXsIOZYBpCRW7lVpPVhaRQnAnjo';

export interface RouteEstimate {
  distanceMeters: number;
  durationSeconds: number;
  formattedDistance: string;
  formattedDuration: string;
  source: 'google_routes' | 'google_directions' | 'order_metadata' | 'haversine_estimate';
}

/**
 * Format duration in seconds to a clean, natural display string.
 * Examples:
 * 45s -> 1 min
 * 312s -> 5 min
 * 390s -> 7 min
 * 3600s -> 1 hr
 * 4500s -> 1 hr 15 min
 */
export const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '1 min';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainingMinutes} min`;
};

/**
 * Format distance in meters to standard km format.
 * Examples:
 * 850m -> 0.9 km
 * 1000m -> 1.0 km
 * 1240m -> 1.2 km
 * 4500m -> 4.5 km
 */
export const formatDistance = (meters: number): string => {
  if (!meters || isNaN(meters) || meters <= 0) return '1.0 km';
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
};

// Route cache keyed by orderId + coordinates
const routeCache = new Map<string, RouteEstimate>();

/**
 * Calculates actual two-wheeler route distance and duration between pickup and drop coordinates.
 */
export const calculateRouteEstimate = async (
  pickup: { latitude: number; longitude: number },
  drop: { latitude: number; longitude: number },
  orderId?: string | number
): Promise<RouteEstimate> => {
  const pLat = pickup.latitude;
  const pLng = pickup.longitude;
  const dLat = drop.latitude;
  const dLng = drop.longitude;

  const cacheKey = `${orderId || 'route'}_${pLat.toFixed(5)}_${pLng.toFixed(5)}_${dLat.toFixed(5)}_${dLng.toFixed(5)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  // 1. Try Google Routes API (computeRoutes) with TWO_WHEELER mode
  try {
    const routesApiUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
    const payload = {
      origin: {
        location: {
          latLng: { latitude: pLat, longitude: pLng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: dLat, longitude: dLng },
        },
      },
      travelMode: 'TWO_WHEELER',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC',
    };

    const res = await fetch(routesApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceMeters = Number(route.distanceMeters) || 1000;
        
        // Duration is returned as string like "390s" or "312s"
        let durationSeconds = 0;
        if (typeof route.duration === 'string') {
          durationSeconds = parseInt(route.duration.replace('s', ''), 10) || 0;
        } else if (typeof route.duration === 'number') {
          durationSeconds = route.duration;
        }

        if (durationSeconds > 0) {
          const result: RouteEstimate = {
            distanceMeters,
            durationSeconds,
            formattedDistance: formatDistance(distanceMeters),
            formattedDuration: formatDuration(durationSeconds),
            source: 'google_routes',
          };
          routeCache.set(cacheKey, result);
          return result;
        }
      }
    }
  } catch (err) {
    console.warn('[RouteService] Google Routes API error, attempting Directions fallback:', err);
  }

  // 2. Fallback: Google Directions API
  try {
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${pLat},${pLng}&destination=${dLat},${dLng}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(directionsUrl);
    if (res.ok) {
      const data = await res.json();
      if (data?.status === 'OK' && data?.routes && data.routes.length > 0) {
        const leg = data.routes[0].legs[0];
        const distanceMeters = leg.distance?.value || 1000;
        const durationSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 300;

        const result: RouteEstimate = {
          distanceMeters,
          durationSeconds,
          formattedDistance: formatDistance(distanceMeters),
          formattedDuration: formatDuration(durationSeconds),
          source: 'google_directions',
        };
        routeCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('[RouteService] Google Directions API fallback error:', err);
  }

  // 3. Fallback: Haversine distance with real urban two-wheeler speed model (~25 km/h)
  const R = 6371; // Earth radius in km
  const dLatRad = ((dLat - pLat) * Math.PI) / 180;
  const dLngRad = ((dLng - pLng) * Math.PI) / 180;
  const a =
    Math.sin(dLatRad / 2) * Math.sin(dLatRad / 2) +
    Math.cos((pLat * Math.PI) / 180) *
      Math.cos((dLat * Math.PI) / 180) *
      Math.sin(dLngRad / 2) *
      Math.sin(dLngRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const roadDistanceKm = Math.max(0.3, R * c * 1.3); // 1.3 road curvature factor
  const distanceMeters = Math.round(roadDistanceKm * 1000);

  // Urban two-wheeler average speed in Indian cities: ~22 km/h + 1 min buffer
  const durationSeconds = Math.round((roadDistanceKm / 22) * 3600 + 60);

  const fallbackResult: RouteEstimate = {
    distanceMeters,
    durationSeconds,
    formattedDistance: formatDistance(distanceMeters),
    formattedDuration: formatDuration(durationSeconds),
    source: 'haversine_estimate',
  };
  routeCache.set(cacheKey, fallbackResult);
  return fallbackResult;
};
