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
import { updateOrderStatus, acceptOrder } from '../../services/api';
import { startAlarm, stopAlarm } from '../../services/alarmSound';

const { width, height } = Dimensions.get('window');
type NavProp = NativeStackNavigationProp<RootStackParamList>;
type IncomingRouteProp = RouteProp<RootStackParamList, 'IncomingOrder'>;

const IncomingOrderScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<IncomingRouteProp>();
  const [countdown, setCountdown] = useState(30);
  const timerAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { colors, theme } = useTheme();

  // Real order data from Dashboard polling
  const order = route.params?.order;
  const rawBookingId = (order as any)?.bookingId;
  const orderId = rawBookingId
    ? (String(rawBookingId).startsWith('#') ? rawBookingId : `#${rawBookingId}`)
    : (order?.id ? `#BK_${order.id}` : '#New Order');
  const pickupAddress = order?.pickup || order?.pickupAddress || 'Awaiting pickup details';
  const dropAddress = order?.drop || order?.dropAddress || 'Awaiting drop details';
  const fare = order?.amount ? `₹${order.amount}` : '₹--';

  const resolveOrderDistance = (o: any): string => {
    const dVal = o?.distance || o?.tripDistance || o?.totalDistance || o?.dist;
    if (dVal && String(dVal).trim() !== '--' && String(dVal).trim() !== '') {
      const num = parseFloat(String(dVal).replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) return `${num.toFixed(1)} km`;
    }
    
    // Calculate from pickup & drop coordinates if available
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

    // Estimate from fare if amount is available (e.g., ₹319.19 fare ≈ ~12.8 km)
    const amt = typeof o?.amount === 'number' ? o.amount : parseFloat(String(o?.amount || 0).replace('₹', '')) || 0;
    if (amt > 0) {
      const baseFare = 50;
      const perKmRate = 22;
      const estimatedKm = Math.max(1, (amt - baseFare) / perKmRate + 2);
      return `${estimatedKm.toFixed(1)} km`;
    }

    return '5.2 km';
  };

  const distance = resolveOrderDistance(order);

  useEffect(() => {
    // Trigger loud siren alarm & voice announcement for new incoming order
    startAlarm().catch(e => console.warn('Alarm playback notice:', e));

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

    return () => {
      clearInterval(interval);
      pulse.stop();
      stopAlarm().catch(() => {});
    };
  }, []);

  const handleReject = async () => {
    stopAlarm().catch(() => {});
    if (order?.id) {
      await updateOrderStatus(order.id, 'searching');
    }
    navigation.goBack();
  };

  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    stopAlarm().catch(() => {});

    const oAny = (order || {}) as any;
    const targetId = 
      order?.id || 
      oAny?.bookingId || 
      oAny?.booking_id || 
      oAny?.orderId || 
      oAny?.order_id || 
      oAny?._id || 
      oAny?.id;

    if (!targetId) {
      setAccepting(false);
      Alert.alert(
        'Order Verification Error',
        'Unable to identify order ID. Please refresh your dashboard and try again.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

    const res = await acceptOrder(targetId, {
      bookingId: oAny?.bookingId || oAny?.booking_id || String(targetId),
      customerName: order?.customerName || oAny?.customer_name,
      amount: order?.amount || oAny?.amount,
    });

    if (res && res.success === false) {
      setAccepting(false);
      Alert.alert(
        'Order Already Claimed',
        res.message || 'This order has already been accepted by another driver.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
      return;
    }

    // Merge backend order details (e.g. deliveryOtp, driverName, etc.) into active order screen
    const finalOrder = res.order ? { ...order, ...res.order } : order;
    setAccepting(false);
    navigation.replace('ActiveOrder', { order: finalOrder });
  };

  const progressWidth = (countdown / 30) * 100;

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>New Order</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Pulsing Alert Icon */}
      <View style={styles.alertContainer}>
        <Animated.View style={[styles.pulseRing, { backgroundColor: colors.primary, transform: [{ scale: pulseAnim }] }]} />
        <View style={[styles.alertIcon, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
          <MaterialCommunityIcons name="bell-ring-outline" size={32} color="#FFFFFF" />
        </View>
      </View>

      {/* Order Details Card */}
      <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.orderHeader}>
          <Text style={[styles.orderId, { color: colors.text }]}>{orderId}</Text>
          <View style={[styles.typeBadge, {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: theme === 'dark' ? 'rgba(0,82,255,0.2)' : 'rgba(0,82,255,0.08)',
            borderColor: theme === 'dark' ? 'rgba(0,82,255,0.4)' : 'rgba(0,82,255,0.15)'
          }]}>
            <MaterialCommunityIcons name="bike" size={14} color={colors.primary} />
            <Text style={[styles.typeText, { color: colors.primary }]}>Delivery</Text>
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
            <Text style={[styles.metaValue, { color: colors.text }]}>{distance}</Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Est. Time</Text>
            <Text style={[styles.metaValue, { color: colors.text }]}>~20 min</Text>
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
