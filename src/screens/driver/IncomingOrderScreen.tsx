import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import { updateOrderStatus, acceptOrder, respondToDriverOffer } from '../../services/api';
import { startAlarm, stopAlarm, getAlarmSound } from '../../services/alarmSound';
import { playOrderRingtone, stopOrderRingtone } from '../../services/orderSoundHelper';
import { stopRingtone } from '../../services/soundManager';
import { telemetrySocket, dismissOffer } from '../../services/telemetrySocket';
import { safeOnMessage } from '../../services/fcmService';

import { calculateRouteEstimate, formatDistance, formatDuration } from '../../services/routeService';

const { width, height } = Dimensions.get('window');
type NavProp = NativeStackNavigationProp<RootStackParamList>;
type IncomingRouteProp = RouteProp<RootStackParamList, 'IncomingOrder'>;

const IncomingOrderScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<IncomingRouteProp>();
  const order = route.params?.order;

  // 60-second tiered countdown from spec (or remainingSeconds from backend offer)
  const initialSeconds = Math.max(1, Math.min(60, Number(order?.remainingSeconds) || 60));
  const maxCountdown = 60;
  const [countdown, setCountdown] = useState(initialSeconds);
  const timerAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { colors, theme } = useTheme();

  // Real order data from Dashboard / WebSocket / Polling
  const rawBookingId = (order as any)?.bookingId;
  const orderId = rawBookingId
    ? (String(rawBookingId).startsWith('#') ? rawBookingId : `#${rawBookingId}`)
    : (order?.id ? `#BK_${order.id}` : '#New Order');
  const pickupAddress = order?.pickup || order?.pickupAddress || 'Awaiting pickup details';
  const dropAddress = order?.drop || order?.dropAddress || 'Awaiting drop details';
  const fare = (order?.offeredFare !== undefined && order?.offeredFare !== null)
    ? `₹${order.offeredFare}`
    : (order?.amount ? `₹${order.amount}` : '₹--');
  const serviceName = order?.serviceName || (order as any)?.vehicleLabel || (order as any)?.service || 'Tata Ace';
  const goodsCategory = order?.goodsCategory || (order as any)?.category || '';
  const serviceType = String(order?.serviceType || (order as any)?.service_type || (order as any)?.type || '').toUpperCase();
  const serviceLabel = (order as any)?.serviceLabel || (order as any)?.label || '';
  const passengerCount = Number((order as any)?.passengerCount || (order as any)?.passengers || 1);
  const isPassenger = serviceType === 'PASSENGER' || 
                      String(orderId).toUpperCase().includes('PASS') || 
                      String(serviceLabel).toLowerCase().includes('passenger') || 
                      String(serviceLabel).toLowerCase().includes('rider') ||
                      String(serviceName).toLowerCase().includes('bike taxi') ||
                      String(serviceName).toLowerCase().includes('cab');

  const resolveOrderDistance = (o: any): string => {
    // 1. Check distanceKm number first
    if (o?.distanceKm !== undefined && o?.distanceKm !== null) {
      const num = parseFloat(String(o.distanceKm));
      if (!isNaN(num) && num > 0) return `${num.toFixed(1)} km`;
    }

    // 2. Check distance string fields
    const dVal = o?.distance || o?.tripDistance || o?.totalDistance || o?.dist;
    if (dVal && String(dVal).trim() !== '--' && String(dVal).trim() !== '') {
      const num = parseFloat(String(dVal).replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) return `${num.toFixed(1)} km`;
    }
    
    // 3. Calculate from pickup & drop coordinates if available
    const pLat = parseFloat(o?.pickupLat || o?.pickupLatitude || o?.pickup_lat || 0);
    const pLng = parseFloat(o?.pickupLng || o?.pickupLongitude || o?.pickup_lng || 0);
    const dLat = parseFloat(o?.dropLat || o?.dropLatitude || o?.drop_lat || 0);
    const dLng = parseFloat(o?.dropLng || o?.dropLongitude || o?.drop_lng || 0);

    if (pLat !== 0 && pLng !== 0 && dLat !== 0 && dLng !== 0) {
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
      const distKm = R * c * 1.25;
      if (distKm > 0.1) return `${distKm.toFixed(1)} km`;
    }

    // 4. Estimate from fare if amount is available AND distanceKm, distance and coordinates are all missing
    const hasDistance = (o?.distanceKm !== undefined && o?.distanceKm !== null) ||
                        (dVal && String(dVal).trim() !== '--' && String(dVal).trim() !== '');
    const hasCoords = pLat !== 0 && pLng !== 0 && dLat !== 0 && dLng !== 0;

    if (!hasDistance && !hasCoords) {
      const amt = typeof o?.amount === 'number' ? o.amount : parseFloat(String(o?.amount || 0).replace('₹', '')) || 0;
      if (amt > 0) {
        const baseFare = 50;
        const perKmRate = 22;
        let estimatedKm = (amt - baseFare) / perKmRate + 2;
        if (amt < baseFare) {
          // For test fares or ultra-low promotional fares, scale down distance proportionally
          estimatedKm = Math.max(0.1, (amt / baseFare) * 2.0);
        } else {
          estimatedKm = Math.max(1.0, estimatedKm);
        }
        return `${estimatedKm.toFixed(1)} km`;
      }
    }

    return '1.0 km';
  };

  const [displayDistance, setDisplayDistance] = useState<string>('Calculating...');
  const [displayEta, setDisplayEta] = useState<string>('Calculating...');
  const currentOrderKeyRef = useRef<string>('');

  useEffect(() => {
    let isCancelled = false;
    const currentKey = String(order?.id || (order as any)?.bookingId || 'new_order');
    currentOrderKeyRef.current = currentKey;

    const pLat = parseFloat((order as any)?.pickupLat || (order as any)?.pickupLatitude || (order as any)?.pickup_lat || (order as any)?.pickupLocation?.lat || (order as any)?.pickup?.latitude || 0);
    const pLng = parseFloat((order as any)?.pickupLng || (order as any)?.pickupLongitude || (order as any)?.pickup_lng || (order as any)?.pickupLocation?.lng || (order as any)?.pickup?.longitude || 0);
    const dLat = parseFloat((order as any)?.dropLat || (order as any)?.dropLatitude || (order as any)?.drop_lat || (order as any)?.dropLocation?.lat || (order as any)?.drop?.latitude || 0);
    const dLng = parseFloat((order as any)?.dropLng || (order as any)?.dropLongitude || (order as any)?.drop_lng || (order as any)?.dropLocation?.lng || (order as any)?.drop?.longitude || 0);

    const computeEta = async () => {
      // 1. If backend already sent route duration / ETA directly in order object
      const backendDurationSec = Number((order as any)?.durationSeconds || (order as any)?.duration_seconds || (order as any)?.duration);
      const backendDistanceMeters = Number((order as any)?.distanceMeters || (order as any)?.distance_meters);
      
      if (!isNaN(backendDurationSec) && backendDurationSec > 0) {
        if (!isCancelled && currentOrderKeyRef.current === currentKey) {
          setDisplayEta(formatDuration(backendDurationSec));
          if (!isNaN(backendDistanceMeters) && backendDistanceMeters > 0) {
            setDisplayDistance(formatDistance(backendDistanceMeters));
          } else {
            setDisplayDistance(resolveOrderDistance(order));
          }
        }
        return;
      }

      // 2. If coordinates are present, compute via Google Routes API (TWO_WHEELER mode)
      if (pLat !== 0 && pLng !== 0 && dLat !== 0 && dLng !== 0) {
        try {
          const estimate = await calculateRouteEstimate(
            { latitude: pLat, longitude: pLng },
            { latitude: dLat, longitude: dLng },
            currentKey
          );

          if (!isCancelled && currentOrderKeyRef.current === currentKey) {
            setDisplayDistance(estimate.formattedDistance);
            setDisplayEta(estimate.formattedDuration);
          }
          return;
        } catch (e) {
          console.warn('[IncomingOrder] Route calculation fallback notice:', e);
        }
      }

      // 3. Fallback if coordinates missing: calculate dynamic ETA from order distance
      if (!isCancelled && currentOrderKeyRef.current === currentKey) {
        const resolvedDist = resolveOrderDistance(order);
        setDisplayDistance(resolvedDist);
        const distKmNum = parseFloat(resolvedDist.replace(/[^0-9.]/g, '')) || 1.0;
        // Two-wheeler city speed ~22 km/h + 1 min pickup/drop buffer
        const estimatedSec = Math.round((distKmNum / 22) * 3600 + 60);
        setDisplayEta(formatDuration(estimatedSec));
      }
    };

    computeEta();

    return () => {
      isCancelled = true;
    };
  }, [order]);

  useEffect(() => {
    // Trigger ringtone alarm for new incoming order
    playOrderRingtone().catch(e => console.warn('Alarm playback notice:', e));

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleReject();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Guard against double-dismiss from concurrent WS + FCM + telemetrySocket listeners
    let isDismissed = false;
    const safeDismiss = () => {
      if (isDismissed) return;
      isDismissed = true;
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    };

    // 1. WebSocket real-time dismissal listener
    const cleanCurrentBk = String(rawBookingId || order?.id || '').replace(/^#+/, '');
    const unsubscribeWs = telemetrySocket.onOfferStop((event) => {
      const cleanIncomingBk = String(event.bookingId || '').replace(/^#+/, '');
      if (!cleanIncomingBk || !cleanCurrentBk || cleanCurrentBk === cleanIncomingBk) {
        console.log(`[IncomingOrder] Offer stopped via WS: ${event.bookingId} (${event.reason})`);
        if (cleanCurrentBk) dismissOffer(cleanCurrentBk);
        stopRingtone().catch(() => {});
        safeDismiss();
      }
    });

    // 2. FCM push dismiss listener (STOP_RINGTONE, OFFER_TOO_LATE, OFFER_DISMISSED, etc.)
    const unsubscribeFcm = safeOnMessage(async (remoteMessage: any) => {
      const action = remoteMessage.data?.action || remoteMessage.data?.type;
      const isStopPush =
        remoteMessage.data?.stopSound === 'true' ||
        remoteMessage.data?.stopSound === true ||
        action === 'STOP_RINGTONE' ||
        action === 'OFFER_TOO_LATE' ||
        action === 'OFFER_DISMISSED' ||
        action === 'STOP_DRIVER_OFFER' ||
        action === 'ORDER_ACCEPTED_STOP_RING' ||
        action === 'ORDER_REJECTED_DISMISS' ||
        action === 'ORDER_OFFER_CANCELLED' ||
        remoteMessage.data?.status === 'TOO_LATE';

      if (isStopPush) {
        const cleanIncomingBk = String(remoteMessage.data?.bookingId || remoteMessage.data?.orderId || '').replace(/^#+/, '');
        if (!cleanIncomingBk || !cleanCurrentBk || cleanIncomingBk === cleanCurrentBk) {
          console.log(`[IncomingOrder] Offer stopped via FCM Push: ${action}`);
          if (cleanCurrentBk) dismissOffer(cleanCurrentBk);
          await stopRingtone().catch(() => {});
          safeDismiss();
        }
      }
    });

    return () => {
      clearInterval(interval);
      pulse.stop();
      stopRingtone().catch(() => {});
      unsubscribeWs();
      if (unsubscribeFcm) unsubscribeFcm();
    };
  }, [rawBookingId, order, navigation]);

  const handleReject = async () => {
    // 1. Immediately stop ringtone locally
    await stopRingtone();

    const allIds = [
      String(rawBookingId || '').replace(/^#+/, ''),
      String(order?.bookingId || '').replace(/^#+/, ''),
      String((order as any)?.orderId || '').replace(/^#+/, ''),
      String((order as any)?.offerId || '').replace(/^#+/, ''),
      String(order?.id || '').replace(/^#+/, ''),
    ].filter(Boolean);

    for (const id of allIds) {
      dismissOffer(id);
    }

    const cleanBk = allIds[0] || '';
    if (cleanBk) {
      respondToDriverOffer(cleanBk, false).catch(() => {});
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);

    // 1. Immediately stop ringtone locally
    await stopRingtone();

    const cleanBk = String(rawBookingId || order?.bookingId || (order as any)?.orderId || order?.id || '').replace(/^#+/, '');
    if (!cleanBk) {
      setAccepting(false);
      Alert.alert(
        'Order Verification Error',
        'Unable to identify order ID. Please refresh your dashboard and try again.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

    try {
      const res = await respondToDriverOffer(cleanBk, true);

      // Case A: Driver WON the ride (200 OK / ASSIGNED)
      if (res && (res.status === 'ASSIGNED' || res.success)) {
        setAccepting(false);
        await stopRingtone();
        const finalOrder = res.order ? { ...order, ...res.order } : order;
        navigation.replace('ActiveOrder', { order: finalOrder });
        return;
      }

      // Case B: Driver was TOO LATE (409 Conflict)
      if (res && (res.status === 'TOO_LATE' || (res as any).statusCode === 409 || (res as any).status === 409)) {
        setAccepting(false);
        await stopRingtone();
        dismissOffer(cleanBk);
        Alert.alert(
          'Order Already Accepted',
          res.message || 'Another driver partner has already accepted this booking.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
        return;
      }

      // Case C: Other failure
      setAccepting(false);
      await stopRingtone();
      Alert.alert(
        'Order Unavailable',
        res?.message || 'This order could not be accepted.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      setAccepting(false);
      await stopRingtone();
      if (err?.response?.status === 409 || err?.statusCode === 409 || err?.status === 'TOO_LATE') {
        dismissOffer(cleanBk);
        Alert.alert(
          'Order Already Accepted',
          err?.response?.data?.message || 'Another driver partner has already accepted this booking.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', err?.message || 'Failed to accept order.');
      }
    }
  };

  const progressWidth = Math.max(0, Math.min(100, (countdown / maxCountdown) * 100));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Background Glow */}
      <View style={[styles.bgGlow, { backgroundColor: colors.primary }]} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleReject} style={[styles.closeBtn, { backgroundColor: colors.card }]}>
          <Ionicons name="close" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {isPassenger ? 'New Passenger Ride 🛵' : 'New Order'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Pulsing Alert Icon */}
      <View style={styles.alertContainer}>
        <Animated.View style={[styles.pulseRing, { backgroundColor: isPassenger ? colors.success : colors.primary, transform: [{ scale: pulseAnim }] }]} />
        <View style={[styles.alertIcon, { backgroundColor: isPassenger ? colors.success : colors.primary, shadowColor: isPassenger ? colors.success : colors.primary }]}>
          <MaterialCommunityIcons name={isPassenger ? "account-clock" : "bell-ring-outline"} size={32} color="#FFFFFF" />
        </View>
      </View>

      {/* Order Details Card */}
      <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.orderHeader}>
          <Text style={[styles.orderId, { color: colors.text }]}>{orderId}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isPassenger ? (
              <View style={[styles.typeBadge, {
                backgroundColor: theme === 'dark' ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.1)',
                borderColor: theme === 'dark' ? 'rgba(16,185,129,0.4)' : 'rgba(16,185,129,0.25)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }]}>
                <MaterialCommunityIcons name="account" size={13} color={colors.success} />
                <Text style={[styles.typeText, { color: colors.success, fontWeight: '700' }]}>
                  {passengerCount} {passengerCount === 1 ? 'Passenger' : 'Passengers'}
                </Text>
              </View>
            ) : goodsCategory ? (
              <View style={[styles.typeBadge, {
                backgroundColor: theme === 'dark' ? 'rgba(255,165,0,0.15)' : 'rgba(255,165,0,0.1)',
                borderColor: theme === 'dark' ? 'rgba(255,165,0,0.3)' : 'rgba(255,165,0,0.2)',
              }]}>
                <Text style={[styles.typeText, { color: colors.warning }]}>{goodsCategory}</Text>
              </View>
            ) : null}
            <View style={[styles.typeBadge, {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: isPassenger 
                ? (theme === 'dark' ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)')
                : (theme === 'dark' ? 'rgba(0,82,255,0.2)' : 'rgba(0,82,255,0.08)'),
              borderColor: isPassenger
                ? (theme === 'dark' ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.2)')
                : (theme === 'dark' ? 'rgba(0,82,255,0.4)' : 'rgba(0,82,255,0.15)')
            }]}>
              <MaterialCommunityIcons 
                name={
                  serviceName.toLowerCase().includes('bike') || serviceName.toLowerCase().includes('2')
                    ? "bike"
                    : (serviceName.toLowerCase().includes('auto') || serviceName.toLowerCase().includes('rickshaw') || serviceName.toLowerCase().includes('3'))
                    ? "rickshaw"
                    : (serviceName.toLowerCase().includes('cab') || serviceName.toLowerCase().includes('car') || serviceName.toLowerCase().includes('taxi'))
                    ? "car"
                    : "truck-fast-outline"
                } 
                size={14} 
                color={isPassenger ? colors.success : colors.primary} 
              />
              <Text style={[styles.typeText, { color: isPassenger ? colors.success : colors.primary }]}>
                {serviceLabel || (isPassenger ? `${serviceName} (Passenger)` : serviceName)}
              </Text>
            </View>
          </View>
        </View>

        {/* Route */}
        <View style={styles.routeContainer}>
          <View style={styles.routePoint}>
            <View style={[styles.routeMarker, styles.pickupMarker, { backgroundColor: colors.success }]}>
              <Ionicons name="location" size={14} color="#FFFFFF" />
            </View>
            <View style={styles.routeInfo}>
              <Text style={[styles.routeTypeLabel, { color: colors.textSecondary }]}>PICKUP</Text>
              <Text style={[styles.routeAddress, { color: colors.text }]} numberOfLines={2}>{pickupAddress}</Text>
            </View>
          </View>
          <View style={[styles.routeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.routePoint}>
            <View style={[styles.routeMarker, styles.dropMarker, { backgroundColor: colors.error }]}>
              <Ionicons name="flag" size={14} color="#FFFFFF" />
            </View>
            <View style={styles.routeInfo}>
              <Text style={[styles.routeTypeLabel, { color: colors.textSecondary }]}>DROP</Text>
              <Text style={[styles.routeAddress, { color: colors.text }]} numberOfLines={2}>{dropAddress}</Text>
            </View>
          </View>
        </View>

        {/* Meta Info */}
        <View style={[styles.metaRow, { backgroundColor: colors.surface }]}>
          <View style={styles.metaItem}>
            <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Distance</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{displayDistance}</Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Est. Time</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>{displayEta}</Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={16} color={colors.success} />
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Fare</Text>
            <Text style={[styles.metaValue, { color: colors.success }]}>{fare}</Text>
          </View>
        </View>
      </View>

      {/* Countdown */}
      <View style={styles.countdownContainer}>
        <View style={[styles.countdownTrack, { backgroundColor: colors.surface }]}>
          <Animated.View style={[styles.countdownBar, { backgroundColor: colors.primary, width: `${progressWidth}%` }]} />
        </View>
        <Text style={[styles.countdownText, { color: colors.textSecondary }]}>Auto-reject in {countdown}s</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.rejectBtn, { borderColor: colors.error }]}
          onPress={handleReject}
        >
          <Ionicons name="close-circle-outline" size={22} color={colors.error} />
          <Text style={[styles.rejectText, { color: colors.error }]}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.acceptBtn, { backgroundColor: colors.success, shadowColor: colors.success }]}
          onPress={handleAccept}
        >
          <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" />
          <Text style={[styles.acceptText, { color: '#FFFFFF' }]}>Accept Order</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    opacity: 0.06,
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  alertContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    marginTop: 10,
  },
  pulseRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    opacity: 0.2,
  },
  alertIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  orderCard: {
    borderRadius: 24,
    margin: 20,
    padding: 20,
    borderWidth: 1,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  routeContainer: {
    gap: 12,
    marginBottom: 20,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  routeMarker: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarker: {},
  dropMarker: {},
  routeInfo: {
    flex: 1,
  },
  routeTypeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 14,
    fontWeight: '500',
  },
  routeDivider: {
    height: 1,
    marginLeft: 46,
  },
  metaRow: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
  },
  metaItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  metaDivider: {
    width: 1,
    marginVertical: 10,
  },
  metaLabel: {
    fontSize: 11,
  },
  metaValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  countdownContainer: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 24,
  },
  countdownTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  countdownBar: {
    height: '100%',
    borderRadius: 3,
  },
  countdownText: {
    fontSize: 13,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 14,
  },
  rejectBtn: {
    flex: 1,
    height: 58,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rejectText: {
    fontSize: 16,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 2,
    height: 58,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default IncomingOrderScreen;
