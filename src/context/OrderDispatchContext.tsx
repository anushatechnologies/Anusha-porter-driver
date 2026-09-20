import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '../services/asyncStorageShim';
import {
  getActiveDriverOffers,
  getActiveOrder,
  updateDriverLocation,
  acceptOrder as apiAcceptOrder,
  rejectDriverOffer,
  respondToDriverOffer,
  DriverOffer,
} from '../services/api';
import { playRingtone, stopRingtone, dismissIncomingOrderModal } from '../services/soundManager';
import { telemetrySocket, dismissOffer, isOfferDismissed } from '../services/telemetrySocket';
import { safeOnMessage, safeOnNotificationOpenedApp, safeGetInitialNotification } from '../services/fcmService';
import { navigationRef } from '../navigation/navigationRef';
import { formatAddressString } from '../utils/urlHelpers';
import { resolveCoordinates, calculateDistanceKm } from '../utils/navigationHelper';

export const MAX_PICKUP_RADIUS_KM = 5.0;

export interface OrderDispatchContextType {
  availableOrders: any[];
  currentModalOrder: any | null;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  location: { lat: number; lng: number } | null;
  setLocation: (loc: { lat: number; lng: number } | null) => void;
  acceptOrder: (bookingId: string | number, extraMeta?: any) => Promise<any>;
  rejectOrder: (bookingId: string | number, reason?: string) => Promise<void>;
  dismissModal: () => void;
  refreshOrders: () => Promise<void>;
}

const OrderDispatchContext = createContext<OrderDispatchContextType | null>(null);

export const useOrderDispatch = () => {
  const context = useContext(OrderDispatchContext);
  if (!context) {
    throw new Error('useOrderDispatch must be used within an OrderDispatchProvider');
  }
  return context;
};

export const OrderDispatchProvider: React.FC<{
  children: React.ReactNode;
  initialOnline?: boolean;
}> = ({ children, initialOnline = false }) => {
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [currentModalOrder, setCurrentModalOrder] = useState<any | null>(null);
  const [isOnline, setIsOnlineState] = useState<boolean>(initialOnline);
  const [location, setLocationState] = useState<{ lat: number; lng: number } | null>(null);

  const isOfferingRef = useRef<boolean>(false);
  const dismissedOfferIdsRef = useRef<Set<string>>(new Set());
  const isOnlineRef = useRef<boolean>(isOnline);
  isOnlineRef.current = isOnline;

  const locationRef = useRef<{ lat: number; lng: number } | null>(location);
  locationRef.current = location;

  // BUG-07 fix: helper to add to dismissedOfferIdsRef with a max-200 cap (LRU eviction)
  const addDismissedId = useCallback((id: string) => {
    const set = dismissedOfferIdsRef.current;
    if (set.size >= 200) {
      const firstKey = set.values().next().value;
      if (firstKey !== undefined) set.delete(firstKey);
    }
    set.add(id);
  }, []);

  // BUG-04 fix: stable ref so the polling interval never needs to restart due to closure changes
  const fetchOrdersRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Initialize online state from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const storedOnline = await AsyncStorage.getItem('@driver_is_online');
        if (storedOnline !== null) {
          const onlineVal = storedOnline === 'true';
          setIsOnlineState(onlineVal);
          isOnlineRef.current = onlineVal;
        }
      } catch (e) {
        console.warn('[OrderDispatchContext] Failed to read @driver_is_online:', e);
      }
    })();
  }, []);

  const setIsOnline = useCallback((online: boolean) => {
    setIsOnlineState(online);
    isOnlineRef.current = online;
    AsyncStorage.setItem('@driver_is_online', online ? 'true' : 'false').catch(() => { });
    if (!online) {
      setAvailableOrders([]);
      setCurrentModalOrder(null);
      isOfferingRef.current = false;
      stopRingtone().catch(() => { });
      dismissIncomingOrderModal();
    }
  }, []);

  const setLocation = useCallback((loc: { lat: number; lng: number } | null) => {
    setLocationState(loc);
    locationRef.current = loc;
  }, []);

  // Helper to check if driver is currently in an active trip or incoming order
  const isDriverBusy = useCallback((): boolean => {
    try {
      if (!navigationRef.isReady()) return false;
      const currentRoute = navigationRef.getCurrentRoute()?.name;
      return currentRoute === 'ActiveOrder' || currentRoute === 'IncomingOrder';
    } catch {
      return false;
    }
  }, []);

  // Format an order object for the IncomingOrder screen
  const normalizeOrderPayload = useCallback((raw: any) => {
    const cleanId = String(raw.bookingId || raw.orderId || raw.offerId || raw.id || '').replace(/^#+/, '');
    const amountVal = Number(raw.offeredFare || raw.amount || raw.fare) || 0;

    const pCoords = resolveCoordinates(
      raw.pickupLat ?? raw.pickupLatitude ?? raw.pickup_lat,
      raw.pickupLng ?? raw.pickupLongitude ?? raw.pickup_lng,
      raw.pickupAddress || raw.pickup
    );
    const dCoords = resolveCoordinates(
      raw.dropLat ?? raw.dropLatitude ?? raw.drop_lat,
      raw.dropLng ?? raw.dropLongitude ?? raw.drop_lng,
      raw.dropAddress || raw.drop
    );

    // Calculate pickup distance if not already present
    let pickupDistVal: number | undefined = undefined;
    if (raw.pickupDistanceKm !== undefined && raw.pickupDistanceKm !== null && !isNaN(Number(raw.pickupDistanceKm))) {
      pickupDistVal = Number(Number(raw.pickupDistanceKm).toFixed(1));
    } else if (locationRef.current && pCoords.lat !== 0 && pCoords.lng !== 0) {
      const computed = calculateDistanceKm(locationRef.current.lat, locationRef.current.lng, pCoords.lat, pCoords.lng);
      if (computed > 0) {
        pickupDistVal = Number(computed.toFixed(1));
      }
    }

    return {
      ...(raw || {}),
      id: cleanId,
      bookingId: raw.bookingId || (cleanId ? `BK_${cleanId}` : cleanId),
      orderId: raw.orderId || raw.id || cleanId,
      offerId: raw.offerId,
      pickup: formatAddressString(raw.pickupAddress || raw.pickup, 'Pickup Location'),
      pickupAddress: formatAddressString(raw.pickupAddress || raw.pickup, 'Pickup Location'),
      drop: formatAddressString(raw.dropAddress || raw.drop, 'Drop Location'),
      dropAddress: formatAddressString(raw.dropAddress || raw.drop, 'Drop Location'),
      pickupLat: pCoords.lat || (raw.pickupLat ?? raw.pickupLatitude),
      pickupLng: pCoords.lng || (raw.pickupLng ?? raw.pickupLongitude),
      dropLat: dCoords.lat || (raw.dropLat ?? raw.dropLatitude),
      dropLng: dCoords.lng || (raw.dropLng ?? raw.dropLongitude),
      amount: amountVal,
      offeredFare: amountVal,
      distanceKm: raw.distanceKm,
      pickupDistanceKm: pickupDistVal,
      remainingSeconds: raw.remainingSeconds || 60,
      serviceName: raw.serviceName || raw.vehicleType || raw.vehicleLabel || 'Vehicle',
      serviceType: raw.serviceType,
      status: raw.status || 'OFFERED',
    };
  }, []);

  // Presentation trigger for an offer
  const presentOffer = useCallback((offer: any) => {
    const normalized = normalizeOrderPayload(offer);
    const cleanId = normalized.id;
    if (!cleanId || dismissedOfferIdsRef.current.has(cleanId) || isOfferDismissed(cleanId)) {
      return;
    }

    // 5km Maximum Pickup Radius Guard: do not offer rides where pickup is > 5km away
    if (normalized.pickupDistanceKm !== undefined && normalized.pickupDistanceKm > MAX_PICKUP_RADIUS_KM) {
      console.log(`[OrderDispatchContext] 🚫 Dropping offer ${cleanId} — pickup is ${normalized.pickupDistanceKm}km away (> ${MAX_PICKUP_RADIUS_KM}km limit)`);
      return;
    }

    if (isDriverBusy()) {
      console.log(`[OrderDispatchContext] Driver is busy, skipping modal presentation for ${cleanId}`);
      return;
    }

    isOfferingRef.current = true;
    setCurrentModalOrder(normalized);
    playRingtone().catch(() => { });

    // Navigate to IncomingOrder screen if ready
    try {
      if (navigationRef.isReady()) {
        const cur = navigationRef.getCurrentRoute()?.name;
        if (cur !== 'IncomingOrder' && cur !== 'ActiveOrder') {
          navigationRef.navigate('IncomingOrder', { order: normalized });
        }
      }
    } catch (err) {
      console.warn('[OrderDispatchContext] Failed to navigate to IncomingOrder:', err);
    }
  }, [isDriverBusy, normalizeOrderPayload]);

  // Polling function for available orders and active assigned trips
  const fetchOrders = useCallback(async () => {
    if (!isOnlineRef.current) return;

    try {
      // 1. If currently on active trip, do not query or interrupt driver
      if (navigationRef.isReady()) {
        const cur = navigationRef.getCurrentRoute()?.name;
        if (cur === 'ActiveOrder') {
          setAvailableOrders([]);
          return;
        }
      }

      // 2. Query live backend for active order or direct assignment
      const liveOrderRes = await getActiveOrder().catch(() => null);
      const activeOrder = liveOrderRes?.order || liveOrderRes;

      if (activeOrder && activeOrder.id) {
        const status = (activeOrder.status || '').toLowerCase();
        const activeStatuses = [
          'accepted', 'picked_up', 'transit', 'arrived', 'in_transit',
          'payment_confirmation_pending', 'delivering', 'otp_verified',
          'active', 'arrived_pickup', 'at_pickup', 'started',
          'ride_started', 'destination_reached'
        ];
        if (activeStatuses.includes(status)) {
          if (navigationRef.isReady()) {
            const cur = navigationRef.getCurrentRoute()?.name;
            if (cur !== 'ActiveOrder') {
              navigationRef.navigate('ActiveOrder', { order: activeOrder });
            }
          }
          setAvailableOrders([]);
          return;
        } else if (['assigned', 'pending', 'searching', 'created', 'offered'].includes(status)) {
          const activeCandidateIds = [
            String(activeOrder.bookingId || '').replace(/^#+/, ''),
            String(activeOrder.orderId || '').replace(/^#+/, ''),
            String(activeOrder.offerId || '').replace(/^#+/, ''),
            String(activeOrder.id || '').replace(/^#+/, ''),
          ].filter(Boolean);

          const isAlreadyDismissed = activeCandidateIds.some(
            (id) => dismissedOfferIdsRef.current.has(id) || isOfferDismissed(id)
          );

          if (!isAlreadyDismissed && !isOfferingRef.current && !isDriverBusy()) {
            presentOffer(activeOrder);
            return;
          }
        }
      }

      // 3. Obtain coordinates
      let coords = locationRef.current;
      if (!coords) {
        const lastLoc = await Location.getLastKnownPositionAsync().catch(() => null);
        if (lastLoc?.coords) {
          coords = { lat: lastLoc.coords.latitude, lng: lastLoc.coords.longitude };
          setLocation(coords);
        }
      }

      const orders = await getActiveDriverOffers(coords || undefined).catch(() => []);
      if (!Array.isArray(orders)) return;

      // Normalize all incoming orders and calculate exact pickup distances
      const normalizedOrders = orders.map((o: any) => normalizeOrderPayload(o));

      // Filter out dismissed / rejected orders AND orders beyond 5km pickup distance
      const freshOrders = normalizedOrders.filter((o: any) => {
        const candidateIds = [
          String(o.bookingId || '').replace(/^#+/, ''),
          String(o.orderId || '').replace(/^#+/, ''),
          String(o.offerId || '').replace(/^#+/, ''),
          String(o.id || '').replace(/^#+/, ''),
        ].filter(Boolean);
        const isDismissed = candidateIds.some(
          (id) => dismissedOfferIdsRef.current.has(id) || isOfferDismissed(id)
        );
        if (isDismissed) return false;

        // 5km Maximum Pickup Radius Guard
        if (o.pickupDistanceKm !== undefined && o.pickupDistanceKm !== null && o.pickupDistanceKm > MAX_PICKUP_RADIUS_KM) {
          return false;
        }

        return true;
      });

      // Sort by pickupDistanceKm (Rapido style: closest first)
      const sorted = [...freshOrders].sort((a: any, b: any) => {
        const distA = a.pickupDistanceKm !== undefined ? Number(a.pickupDistanceKm) : undefined;
        const distB = b.pickupDistanceKm !== undefined ? Number(b.pickupDistanceKm) : undefined;
        if (distA !== undefined && distB !== undefined && distA !== distB) {
          return distA - distB;
        }
        const timeA = new Date(a.createdAt || a.created_at || 0).getTime();
        const timeB = new Date(b.createdAt || b.created_at || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return Number(b.id || 0) - Number(a.id || 0);
      });

      setAvailableOrders(sorted);

      // If driver is not currently looking at an offer and orders exist, ring and present the closest
      if (sorted.length > 0 && !isOfferingRef.current && !isDriverBusy()) {
        presentOffer(sorted[0]);
      }
    } catch (err) {
      console.warn('[OrderDispatchContext] Polling available orders error:', err);
    }
  }, [isDriverBusy, presentOffer, setLocation]);

  const refreshOrders = useCallback(async () => {
    await fetchOrders();
  }, [fetchOrders]);

  // BUG-04 fix: keep the ref up-to-date with the latest fetchOrders closure
  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  // Main 4-second polling interval when ONLINE — runs across all screens (Dashboard, Profile, Earnings)
  useEffect(() => {
    if (!isOnline) {
      setAvailableOrders([]);
      setCurrentModalOrder(null);
      isOfferingRef.current = false;
      stopRingtone().catch(() => { });
      return;
    }

    fetchOrdersRef.current();
    const interval = setInterval(() => fetchOrdersRef.current(), 4000);
    return () => clearInterval(interval);
  }, [isOnline]); // ← fetchOrders intentionally omitted; ref keeps it fresh

  // Continuous Location Tracking & WebSocket Sync while Online across all screens (Profile, Earnings, etc.)
  useEffect(() => {
    let locationWatcher: Location.LocationSubscription | null = null;

    const startLocationTracking = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const initialLoc = (await Location.getLastKnownPositionAsync().catch(() => null))
          || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));

        if (initialLoc?.coords) {
          const coords = { lat: initialLoc.coords.latitude, lng: initialLoc.coords.longitude };
          setLocation(coords);
          updateDriverLocation(
            initialLoc.coords.latitude,
            initialLoc.coords.longitude,
            initialLoc.coords.heading ?? undefined
          ).catch(() => { });
          telemetrySocket.sendLocation(
            initialLoc.coords.latitude,
            initialLoc.coords.longitude,
            initialLoc.coords.heading ?? undefined
          );
        }

        locationWatcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 8000,
            distanceInterval: 10,
          },
          (loc) => {
            if (loc?.coords) {
              const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
              setLocation(coords);
              updateDriverLocation(
                loc.coords.latitude,
                loc.coords.longitude,
                loc.coords.heading ?? undefined
              ).catch(() => { });
              telemetrySocket.sendLocation(
                loc.coords.latitude,
                loc.coords.longitude,
                loc.coords.heading ?? undefined
              );
            }
          }
        );
      } catch (err) {
        console.warn('[OrderDispatchContext] Location tracking warning:', err);
      }
    };

    if (isOnline) {
      telemetrySocket.connectTelemetry();
      startLocationTracking();
    } else {
      telemetrySocket.disconnectTelemetry();
    }

    return () => {
      if (locationWatcher) {
        locationWatcher.remove();
      }
    };
  }, [isOnline, setLocation]);

  // Global WebSocket Offer Listeners (TelemetrySocket)
  useEffect(() => {
    const unsubOfferNew = telemetrySocket.onOfferNew((event) => {
      if (!isOnlineRef.current) return;
      console.log('[OrderDispatchContext] 🚨 WebSocket offer received:', event.bookingId);
      const offerData = event.data || {};
      const normalized = normalizeOrderPayload(offerData);

      // 5km Maximum Pickup Radius Guard
      if (normalized.pickupDistanceKm !== undefined && normalized.pickupDistanceKm !== null && normalized.pickupDistanceKm > MAX_PICKUP_RADIUS_KM) {
        console.log(`[OrderDispatchContext] 🚫 WebSocket offer ${normalized.id} pickup is ${normalized.pickupDistanceKm}km away (> ${MAX_PICKUP_RADIUS_KM}km limit), skipping.`);
        return;
      }

      setAvailableOrders((prev) => {
        const cleanId = normalized.id;
        const exists = prev.some((o) => {
          const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
          return oId === cleanId;
        });
        if (exists) return prev;
        return [normalized, ...prev];
      });

      if (!isOfferingRef.current && !isDriverBusy()) {
        presentOffer(normalized);
      }
    });

    const unsubOfferStop = telemetrySocket.onOfferStop((event) => {
      console.log('[OrderDispatchContext] 🛑 WebSocket offer stop received:', event.bookingId);
      const cleanBk = String(event.bookingId || '').replace(/^#+/, '');
      if (cleanBk) {
        addDismissedId(cleanBk);
        dismissOffer(cleanBk);
      }
      stopRingtone().catch(() => { });
      isOfferingRef.current = false;
      setCurrentModalOrder(null);
      dismissIncomingOrderModal(cleanBk);
      setAvailableOrders((prev) =>
        prev.filter((o) => {
          const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
          return oId !== cleanBk;
        })
      );
    });

    return () => {
      unsubOfferNew();
      unsubOfferStop();
    };
  }, [addDismissedId, isDriverBusy, normalizeOrderPayload, presentOffer]);

  // Global Foreground FCM Push Listener
  useEffect(() => {
    const unsubscribeFCM = safeOnMessage(async (remoteMessage: any) => {
      if (!isOnlineRef.current) return;
      const data = remoteMessage?.data || {};
      const action = data.action || data.type;
      const cleanBk = String(data.bookingId || data.orderId || data.id || '').replace(/^#+/, '');

      const isSilentStop =
        data.stopSound === 'true' ||
        data.stopSound === true ||
        data.stopAudio === 'true' ||
        data.stopAudio === true ||
        data.stop_ringtone === 'true' ||
        action === 'STOP_RINGTONE' ||
        action === 'STOP_DRIVER_OFFER' ||
        action === 'ORDER_ACCEPTED_STOP_RING' ||
        action === 'ORDER_REJECTED_DISMISS' ||
        action === 'ORDER_OFFER_CANCELLED' ||
        action === 'OFFER_TOO_LATE' ||
        action === 'OFFER_DISMISSED' ||
        data.status === 'TOO_LATE' ||
        data.status === 'STOPPED';

      if (isSilentStop) {
        console.log('[OrderDispatchContext FCM] Stop push received for booking:', cleanBk);
        stopRingtone().catch(() => { });
        isOfferingRef.current = false;
        setCurrentModalOrder(null);
        if (cleanBk) {
          addDismissedId(cleanBk);
          dismissOffer(cleanBk);
          dismissIncomingOrderModal(cleanBk);
        } else {
          dismissIncomingOrderModal();
        }
        setAvailableOrders((prev) =>
          prev.filter((o) => {
            const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
            return oId !== cleanBk;
          })
        );
        return;
      }

      const isOrderOfferAction =
        action === 'ORDER_OFFER' ||
        action === 'NEW_ORDER' ||
        action === 'NEW_BOOKING' ||
        action === 'BOOKING_OFFER' ||
        action === 'RIDE_OFFER' ||
        action === 'RIDE_REQUEST' ||
        action === 'driver:offer:new' ||
        Boolean(cleanBk && !isSilentStop);

      if (isOrderOfferAction && cleanBk) {
        if (dismissedOfferIdsRef.current.has(cleanBk) || isOfferDismissed(cleanBk)) {
          return;
        }

        console.log('[OrderDispatchContext FCM] 🚨 Incoming order push:', cleanBk);
        let parsedOrder: any = null;
        if (data.order) {
          try {
            parsedOrder = typeof data.order === 'string' ? JSON.parse(data.order) : data.order;
          } catch { }
        }
        const orderPayload = normalizeOrderPayload({
          ...(parsedOrder || {}),
          ...data,
          id: cleanBk,
          bookingId: cleanBk,
        });

        setAvailableOrders((prev) => {
          const exists = prev.some((o) => {
            const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
            return oId === cleanBk;
          });
          if (exists) return prev;
          return [orderPayload, ...prev];
        });

        if (!isOfferingRef.current && !isDriverBusy()) {
          presentOffer(orderPayload);
        }
      }
    });

    return () => {
      if (unsubscribeFCM) unsubscribeFCM();
    };
  }, [addDismissedId, isDriverBusy, normalizeOrderPayload, presentOffer]);

  // Driver accepts order
  const acceptOrder = async (bookingId: string | number, extraMeta?: any): Promise<any> => {
    await stopRingtone();
    isOfferingRef.current = false;
    setCurrentModalOrder(null);
    const cleanBk = String(bookingId).replace(/^#+/, '');

    try {
      // First try respondToDriverOffer if active offer
      const res = await respondToDriverOffer(cleanBk, true).catch(() => null);

      if (res && (res.status === 'ASSIGNED' || (res.status && String(res.status).toLowerCase() === 'accepted') || res.success)) {
        await stopRingtone();
        dismissIncomingOrderModal(cleanBk);
        const orderData = res.order || { id: cleanBk, bookingId: cleanBk, ...(extraMeta || {}) };
        if (navigationRef.isReady()) {
          navigationRef.navigate('ActiveOrder', { order: orderData });
        }
        return { success: true, order: orderData };
      }

      if (res && (res.status === 'TOO_LATE' || (res as any).statusCode === 409 || (res as any).status === 409)) {
        await stopRingtone();
        addDismissedId(cleanBk);
        dismissOffer(cleanBk);
        dismissIncomingOrderModal(cleanBk);
        setAvailableOrders((prev) =>
          prev.filter((o) => {
            const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
            return oId !== cleanBk;
          })
        );
        Alert.alert(
          'Order Already Accepted',
          res.message || 'Another driver partner has already accepted this booking.'
        );
        return { success: false, statusCode: 409, message: res.message };
      }

      // Fallback: direct atomic acceptOrder endpoint
      const directRes = await apiAcceptOrder(cleanBk, extraMeta);
      if (directRes.success && directRes.statusCode === 200) {
        await stopRingtone();
        dismissIncomingOrderModal(cleanBk);
        const orderData = directRes.order || { id: cleanBk, bookingId: cleanBk, ...(extraMeta || {}) };
        if (navigationRef.isReady()) {
          navigationRef.navigate('ActiveOrder', { order: orderData });
        }
        return directRes;
      }

      if (directRes.statusCode === 409 || directRes.error === 'TOO_LATE') {
        await stopRingtone();
        addDismissedId(cleanBk);
        dismissOffer(cleanBk);
        dismissIncomingOrderModal(cleanBk);
        setAvailableOrders((prev) =>
          prev.filter((o) => {
            const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
            return oId !== cleanBk;
          })
        );
        Alert.alert(
          'Order Already Accepted',
          directRes.message || 'Another driver partner accepted this order.'
        );
        return directRes;
      }

      // Other failure
      Alert.alert('Order Unavailable', directRes.message || 'Could not accept this order.');
      return directRes;
    } catch (err: any) {
      console.warn('[OrderDispatchContext] acceptOrder exception:', err);
      if (err?.statusCode === 409 || err?.response?.status === 409) {
        dismissedOfferIdsRef.current.add(cleanBk);
        dismissOffer(cleanBk);
        dismissIncomingOrderModal(cleanBk);
        setAvailableOrders((prev) =>
          prev.filter((o) => {
            const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
            return oId !== cleanBk;
          })
        );
        Alert.alert('Order Already Accepted', 'Another driver partner accepted this order.');
      }
      return { success: false, error: err?.message };
    }
  };

  // Driver rejects order
  const rejectOrder = async (bookingId: string | number, reason?: string): Promise<void> => {
    await stopRingtone();
    isOfferingRef.current = false;
    setCurrentModalOrder(null);
    const cleanBk = String(bookingId).replace(/^#+/, '');

    if (cleanBk) {
      addDismissedId(cleanBk);
      dismissOffer(cleanBk);
      dismissIncomingOrderModal(cleanBk);

      setAvailableOrders((prev) =>
        prev.filter((o) => {
          const oId = String(o.bookingId || o.orderId || o.id || '').replace(/^#+/, '');
          return oId !== cleanBk;
        })
      );

      // Call backend reject endpoint
      rejectDriverOffer(cleanBk, reason || 'driver_rejected').catch(() => {
        respondToDriverOffer(cleanBk, false).catch(() => { });
      });
    }
  };

  const dismissModal = useCallback(() => {
    stopRingtone().catch(() => { });
    isOfferingRef.current = false;
    setCurrentModalOrder(null);
    dismissIncomingOrderModal();
  }, []);

  return (
    <OrderDispatchContext.Provider
      value={{
        availableOrders,
        currentModalOrder,
        isOnline,
        setIsOnline,
        location,
        setLocation,
        acceptOrder,
        rejectOrder,
        dismissModal,
        refreshOrders,
      }}
    >
      {children}
    </OrderDispatchContext.Provider>
  );
};
