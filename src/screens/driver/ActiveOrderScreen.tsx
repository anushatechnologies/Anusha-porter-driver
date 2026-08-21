import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Linking,
  PanResponder,
  Animated,
  Dimensions,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Svg, { Path, Rect, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { updateOrderStatus, getActiveOrder, getOrderDetails, sendDeliveryNotification, createPaymentOrder, getPaymentStatus, verifyDeliveryOtpOnly, confirmPaymentAndCompleteOrder, getDriverWallet, setDriverOnlineStatus } from '../../services/api';
import AsyncStorage from '../../services/asyncStorageShim';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type ActiveRouteProp = RouteProp<RootStackParamList, 'ActiveOrder'>;

const STEPS = [
  { key: 'reached_pickup', label: 'Reached Pickup', iconName: 'location', desc: 'Arrived at pickup location' },
  { key: 'picked_up', label: 'Picked Up', iconName: 'cube', desc: 'Package collected from sender' },
  { key: 'start_delivery', label: 'Start Delivery', iconName: 'rocket', desc: 'En route to delivery address' },
  { key: 'delivered', label: 'Delivered', iconName: 'checkmark-circle', desc: 'Package delivered successfully' },
];

const UBER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#112922' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#475569' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f8fafc' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
];

const ActiveOrderScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ActiveRouteProp>();
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const { colors, theme } = useTheme();
  const [driverName, setDriverName] = useState('');

  // Load driver name from profile storage instead of hardcoding
  useEffect(() => {
    (async () => {
      try {
        const profileStr = await AsyncStorage.getItem('driverProfile');
        if (profileStr) {
          const p = JSON.parse(profileStr);
          setDriverName(p?.name || p?.driverName || p?.fullName || 'Driver');
        }
      } catch (e) {}
    })();
  }, []);

  // Real live order data from params or live backend sync
  const [activeOrder, setActiveOrder] = useState<any>(route.params?.order || null);

  useEffect(() => {
    let isMounted = true;
    const syncLiveOrder = async () => {
      try {
        const live = await getActiveOrder();
        if (live && isMounted) {
          // If customer details missing, attempt detailed order fetch
          if (!live.customerPhone && live.id) {
            const details = await getOrderDetails(live.id);
            if (details && isMounted) {
              // Preserve the deliveryOtp from the first successful fetch to avoid OTP drift
              setActiveOrder((prev: any) => {
                const preservedOtp = prev?.deliveryOtp || live.deliveryOtp || details.deliveryOtp;
                return { ...live, ...details, deliveryOtp: preservedOtp };
              });
            } else {
              setActiveOrder((prev: any) => {
                const preservedOtp = prev?.deliveryOtp || live.deliveryOtp;
                return { ...live, deliveryOtp: preservedOtp };
              });
            }
          } else {
            setActiveOrder((prev: any) => {
              const preservedOtp = prev?.deliveryOtp || live.deliveryOtp;
              return { ...live, deliveryOtp: preservedOtp };
            });
          }

          const s = (live.status || '').toLowerCase();
          let backendStep = 0;
          if (s === 'accepted') backendStep = 0;
          else if (s === 'picked_up') backendStep = 1;
          else if (s === 'transit' || s === 'in_transit') backendStep = 2;
          else if (s === 'arrived') backendStep = 3;

          // Only advance currentStep, never regress back to 0
          setCurrentStep(prev => Math.max(prev, backendStep));
        }
      } catch (e) {
        console.warn('Failed to sync live order on map screen', e);
      }
    };
    syncLiveOrder();
    const interval = setInterval(syncLiveOrder, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const orderId = activeOrder?.id;
  const displayOrderId = activeOrder?.bookingId || (orderId ? `#ORD-${orderId}` : '#ORD-LIVE');
  const customerName = 
    activeOrder?.customerName || 
    activeOrder?.customer_name || 
    activeOrder?.senderName || 
    activeOrder?.contactName || 
    activeOrder?.receiverName || 
    activeOrder?.userName || 
    activeOrder?.customer?.name || 
    activeOrder?.user?.name || 
    activeOrder?.pickupName || 
    (typeof activeOrder?.customer === 'string' ? activeOrder.customer : '') || 
    'Customer';
  const customerPhone = 
    activeOrder?.customerPhone || 
    activeOrder?.customer_phone || 
    activeOrder?.senderPhone || 
    activeOrder?.contactPhone || 
    activeOrder?.receiverPhone || 
    activeOrder?.userPhone || 
    activeOrder?.customer?.phone || 
    activeOrder?.user?.phone || 
    activeOrder?.phone || 
    activeOrder?.mobile || 
    activeOrder?.pickupPhone || 
    activeOrder?.mobileNumber || 
    activeOrder?.phoneNumber || 
    '';
  const pickupAddress = activeOrder?.pickupAddress || activeOrder?.pickup || 'Pickup location';
  const dropAddress = activeOrder?.dropAddress || activeOrder?.drop || 'Drop location';
  const rawAmount = typeof activeOrder?.amount === 'number' && activeOrder.amount > 0
    ? activeOrder.amount
    : parseFloat(String(activeOrder?.amount || activeOrder?.fare || activeOrder?.price || activeOrder?.totalAmount || activeOrder?.totalFare || activeOrder?.payout || '0').replace('₹', '')) || 0;
  const fare = rawAmount;

  // Use coordinates from backend order data; fall back to a generic centre only if truly absent
  const PICKUP_COORD = {
    latitude: parseFloat(activeOrder?.pickupLat || activeOrder?.pickup_lat || '0') || 17.385044,
    longitude: parseFloat(activeOrder?.pickupLng || activeOrder?.pickup_lng || activeOrder?.pickupLon || '0') || 78.486671,
  };
  const DROP_COORD = {
    latitude: parseFloat(activeOrder?.dropLat || activeOrder?.drop_lat || '0') || 17.405044,
    longitude: parseFloat(activeOrder?.dropLng || activeOrder?.drop_lng || activeOrder?.dropLon || '0') || 78.506671,
  };

  const handleMapPress = () => {
    const targetAddr = currentStep < 2 ? pickupAddress : dropAddress;
    Linking.openURL(`google.navigation:q=${encodeURIComponent(targetAddr)}`);
  };

  // Map step index to backend status values (Step 3 is null so it strictly opens OTP modal)
  const stepStatuses = ['picked_up', 'transit', 'arrived', null];

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [deliveryOtp, setDeliveryOtp] = useState(['', '', '', '']);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const otpInputRefs = [React.useRef<TextInput>(null), React.useRef<TextInput>(null), React.useRef<TextInput>(null), React.useRef<TextInput>(null)];

  // Payment & Dynamic QR Settlement Modal state
  const [showPaymentQrModal, setShowPaymentQrModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | null>(null);
  const [collectedAmount, setCollectedAmount] = useState('');
  const [commRate, setCommRate] = useState(5);
  const [paymentVerifying, setPaymentVerifying] = useState(false);
  const [paymentSuccessAnim, setPaymentSuccessAnim] = useState(false);
  const [isPaymentVerifiedByServer, setIsPaymentVerifiedByServer] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<{
    grossFare: number;
    commission: number;
    netEarning: number;
    paymentId: string;
    txnId?: string;
    upiUrl?: string;
    qrImageUrl?: string;
    gateway?: string;
  } | null>(null);

  const [isTransitioning, setIsTransitioning] = useState(false);

  // Restore saved cargo step and payment modal state from storage on mount
  useEffect(() => {
    let isMounted = true;

    const fetchCommissionAndState = async () => {
      try {
        const wal = await getDriverWallet().catch(() => null);
        if (wal && wal.wallet && wal.wallet.commissionPercentage && isMounted) {
          setCommRate(wal.wallet.commissionPercentage);
        }
      } catch (e) {}

      try {
        const currentId = orderId || displayOrderId;
        if (!currentId) return;
        const raw = await AsyncStorage.getItem(`@active_order_data_${currentId}`);
        if (raw && isMounted) {
          const savedData = JSON.parse(raw);
          if (savedData.currentStep !== undefined && savedData.currentStep > currentStep) {
            setCurrentStep(savedData.currentStep);
          }
          if (savedData.showPaymentQrModal && savedData.paymentDetails) {
            setPaymentDetails(savedData.paymentDetails);
            setShowPaymentQrModal(true);
          }
        }
      } catch (e) {
        console.warn('[CARGO] Failed to load saved active order state:', e);
      }
    };

    fetchCommissionAndState();
    return () => { isMounted = false; };
  }, [orderId, displayOrderId]);

  type DeliveryCompletionState = 'ready' | 'submitting' | 'success' | 'failed';
  const [completionState, setCompletionState] = useState<DeliveryCompletionState>('ready');
  const completionTriggered = React.useRef(false);

  // Persist modal and step changes whenever state updates
  useEffect(() => {
    const currentKey = String(orderId || displayOrderId || '');
    if (!currentKey || completed || completionState === 'success') return;

    AsyncStorage.setItem(`@active_cargo_step_${currentKey}`, String(currentStep)).catch(() => {});
    AsyncStorage.setItem(
      `@active_order_data_${currentKey}`,
      JSON.stringify({
        currentStep,
        showPaymentQrModal,
        paymentDetails,
        updatedAt: Date.now(),
      })
    ).catch(() => {});
  }, [orderId, displayOrderId, currentStep, showPaymentQrModal, paymentDetails, completed, completionState]);

  const handleStepComplete = async () => {
    if (isTransitioning) {
      console.log('[CARGO] Transition already in progress, ignoring duplicate tap/swipe');
      return;
    }

    setIsTransitioning(true);
    const fromStep = currentStep;
    const toStep = currentStep + 1;

    console.log('[CARGO] Current step:', currentStep + 1);
    console.log('[CARGO] Transition requested:', {
      from: fromStep + 1,
      to: toStep + 1,
      orderId: orderId || displayOrderId,
      activeOrder,
      pickupLocation: pickupAddress,
      deliveryLocation: dropAddress,
    });

    try {
      if (currentStep < STEPS.length - 1) {
        const statusToSend = stepStatuses[currentStep];
        const meta = { bookingId: displayOrderId, driverName: driverName || 'Driver', customerName, amount: fare };
        
        if (statusToSend) {
          if (orderId) {
            const res = await updateOrderStatus(orderId, statusToSend, undefined, meta);
            if (!res || !res.success) throw new Error(`Backend update status failed for step ${currentStep + 1}`);
          } else {
            await sendDeliveryNotification({ orderId: 'LIVE', status: statusToSend, ...meta });
          }
        }

        const nextStep = Math.min(currentStep + 1, STEPS.length - 1);
        setCurrentStep(nextStep);

        // Persist active step state
        if (orderId) {
          await AsyncStorage.setItem(`@active_cargo_step_${orderId}`, String(nextStep));
        }

        console.log('[CARGO] Transition successful to step:', nextStep + 1);
      } else {
        // Final step (Delivered swipe) strictly opens Customer Delivery OTP modal
        setShowOtpModal(true);
      }
    } catch (error) {
      console.error('[CARGO] STEP TRANSITION ERROR', {
        fromStep: fromStep + 1,
        toStep: toStep + 1,
        orderId: orderId || displayOrderId,
        error,
      });

      Alert.alert(
        'Unable to Continue',
        'We could not update the delivery step status with the server. Please check your network and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsTransitioning(false);
    }
  };


  useEffect(() => {
    console.log('[DELIVERY] Step 4 screen mounted', {
      orderId: orderId || displayOrderId,
      status: activeOrder?.status,
      currentStep: currentStep + 1,
    });
  }, [orderId, displayOrderId, currentStep, activeOrder?.status]);

  const expectedOtp = String(
    activeOrder?.deliveryOtp ||
    activeOrder?.otp ||
    activeOrder?.otpCode ||
    activeOrder?.deliveryOtpCode ||
    ''
  );

  const handleVerifyDeliveryOtp = async () => {
    if (completionState === 'submitting' || completionTriggered.current) {
      console.log('[DELIVERY] Completion API already in progress, ignoring duplicate trigger');
      return;
    }

    const enteredOtp = deliveryOtp.join('');
    if (enteredOtp.length < 4) {
      Alert.alert('Incomplete OTP', 'Please enter the 4-digit Customer Delivery OTP.');
      return;
    }

    // Skip client-side OTP pre-validation — let the backend be the single source of truth
    // This prevents mismatches caused by OTP drift during polling
    console.log('[DELIVERY] Submitting OTP to backend for validation:', enteredOtp);

    // Validate active order existence
    if (!orderId && !displayOrderId) {
      console.error('[DELIVERY] Missing active order ID before completion');
      setCompletionState('failed');
      Alert.alert(
        'Unable to Complete Delivery',
        'The active delivery information is unavailable. Please try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    completionTriggered.current = true;
    setCompletionState('submitting');
    setVerifyingOtp(true);

    console.log('[DELIVERY] Swipe started');
    console.log('[DELIVERY] Completion API started', {
      orderId: orderId || displayOrderId,
      otp: enteredOtp,
      amount: fare,
    });

    try {
      // Step 1: Validate Delivery OTP with backend ONLY (without marking order as completed or delivered)
      const res = await verifyDeliveryOtpOnly(orderId || displayOrderId, enteredOtp);
      if (!res || !res.success) {
        setVerifyingOtp(false);
        completionTriggered.current = false;
        setCompletionState('failed');
        Alert.alert(
          'Incorrect Customer OTP',
          res?.message || 'The OTP entered is incorrect. Please ask the customer for their 4-digit verification code.',
          [{ text: 'Re-enter OTP', onPress: () => setDeliveryOtp(['', '', '', '']) }]
        );
        return;
      }

      console.log('[DELIVERY] OTP Verified! Moving to PAYMENT_CONFIRMATION_PENDING. Order is NOT marked as delivered yet.');

      const grossFare = typeof fare === 'number' ? fare : parseFloat(String(fare || 0)) || 500;
      const commission = Math.round(grossFare * (commRate / 100)); // platform commission
      const netEarning = grossFare - commission; // Driver net earnings
      const paymentId = `PAY_${displayOrderId}_${Date.now().toString().slice(-6)}`;

      setPaymentDetails({
        grossFare,
        commission,
        netEarning,
        paymentId,
      });

      completionTriggered.current = false;
      setCompletionState('ready');
      setVerifyingOtp(false);
      setShowOtpModal(false);
      setPaymentMethod(null);
      setCollectedAmount(String(grossFare));
      setShowPaymentQrModal(true);

    } catch (error: any) {
      completionTriggered.current = false;
      setVerifyingOtp(false);
      setCompletionState('failed');

      console.error('[DELIVERY] OTP verification failed', {
        orderId: orderId || displayOrderId,
        error,
      });

      const errorMsg = error?.message || 'Unable to verify OTP with server.';
      Alert.alert(
        'Unable to Verify OTP',
        `We couldn't verify the OTP.\n\nYour active delivery has NOT been cancelled.\n\nDetail: ${errorMsg}`,
        [{ text: 'Try Again', onPress: () => setCompletionState('ready') }]
      );
    }
  };



  const completionIdempotencyKey = useRef<string>('');

  // Handle Driver Tap on Settlement / Verify Button
  const handleSettlePayment = async () => {
    if (paymentVerifying) return;
    setPaymentVerifying(true);

    if (!paymentMethod) {
      setPaymentVerifying(false);
      Alert.alert('Selection Required', 'Please select a payment method (Cash or Online).');
      return;
    }

    const parsedCollected = parseFloat(collectedAmount) || 0;
    const dueAmount = paymentDetails?.grossFare || fare;

    if (parsedCollected !== dueAmount) {
      setPaymentVerifying(false);
      Alert.alert(
        'Validation Error',
        `Collected amount (₹${parsedCollected}) must match the Amount Due (₹${dueAmount}).`
      );
      return;
    }

    try {
      if (!completionIdempotencyKey.current) {
        completionIdempotencyKey.current = `COMPL_${orderId || displayOrderId}_${Date.now()}`;
      }

      const meta = {
        bookingId: displayOrderId,
        driverName: driverName || 'Driver',
        customerName,
        customerPhone,
        amount: parsedCollected,
        paymentMethod: paymentMethod === 'cash' ? 'CASH' : 'ONLINE',
        pickup: pickupAddress,
        drop: dropAddress,
        distance: activeOrder?.distance || '',
      };

      // 1. Show immediate visual feedback: Pop Green Checkmark on QR Code
      setPaymentSuccessAnim(true);
      setIsPaymentVerifiedByServer(true);

      // 2. Explicit backend call to confirm payment and mark order as DELIVERED in database
      const res = await confirmPaymentAndCompleteOrder(orderId || displayOrderId, meta, completionIdempotencyKey.current);

      if (!res || !res.success) {
        setPaymentVerifying(false);
        setPaymentSuccessAnim(false);

        // If HTTP 422: OTP not verified yet -> Return driver to Step 1 (OTP screen)
        if (res?.statusCode === 422) {
          setShowPaymentQrModal(false);
          setShowOtpModal(true);
          setDeliveryOtp(['', '', '', '']);
          Alert.alert(
            'OTP Required (422)',
            'Customer OTP is required before confirming payment. Please enter the OTP to continue.',
            [{ text: 'Enter OTP' }]
          );
          return;
        }

        Alert.alert(
          'Payment Confirmation Failed',
          res?.message || 'Could not record payment confirmation on server. Please try again.',
          [{ text: 'Retry' }]
        );
        return;
      }

      // 3. Clean up active delivery state from storage only after backend confirmation
      const currentKey = String(orderId || displayOrderId || '');
      await AsyncStorage.removeItem('@current_active_delivery_id');
      if (currentKey) {
        await AsyncStorage.removeItem(`@active_cargo_step_${currentKey}`);
        await AsyncStorage.removeItem(`@active_order_${currentKey}`);
        await AsyncStorage.removeItem(`@active_order_data_${currentKey}`);
      }

      // 4. Keep Success Tick Mark Animation visible on QR Code for 2.5 seconds
      await new Promise(r => setTimeout(r, 2500));

      setPaymentVerifying(false);
      setShowPaymentQrModal(false);
      setPaymentSuccessAnim(false);
      setCompletionState('success');
      setCompleted(true);

      const gross = res.earnings?.grossFare || paymentDetails?.grossFare || fare;
      const comm = res.earnings?.platformCommission || paymentDetails?.commission || Math.round(gross * (commRate / 100));
      const net = res.earnings?.driverNetEarning || paymentDetails?.netEarning || (gross - comm);
      const driverPct = Math.max(0, 100 - commRate);

      // Check current persistent running wallet balance
      let remainingWallet = res.updatedBalance;
      if (remainingWallet === undefined) {
        const walRes = await getDriverWallet().catch(() => null);
        remainingWallet = walRes?.wallet?.availableBalance ?? (typeof (walRes as any)?.availableBalance === 'number' ? (walRes as any).availableBalance : 0);
      }
      const finalRemainingWallet = typeof remainingWallet === 'number' ? remainingWallet : 0;

      if (finalRemainingWallet < 10) {
        // Automatically switch driver OFFLINE when balance falls below ₹10
        await AsyncStorage.setItem('@driver_is_online', 'false');
        try {
          await setDriverOnlineStatus('offline');
        } catch (e) {}

        Alert.alert(
          finalRemainingWallet <= 0 ? 'WALLET BALANCE EXHAUSTED' : 'WALLET BALANCE INSUFFICIENT',
          `Delivery Completed!\n\nRide Fare: ₹${gross}\nAdmin Commission (${commRate}%): -₹${comm}\nYour Net Earnings (${driverPct}%): ₹${net}\n\nRemaining Wallet Balance: ₹${finalRemainingWallet.toFixed(2)}\n\nYour balance is below the minimum required ₹10. Recharge your wallet to continue receiving orders.`,
          [
            {
              text: 'Recharge Wallet',
              onPress: () => {
                navigation.dispatch(
                  CommonActions.reset({
                    index: 0,
                    routes: [{ name: 'Wallet' as any }],
                  })
                );
              },
            },
            {
              text: 'Go to Dashboard',
              style: 'cancel',
              onPress: () => {
                navigation.dispatch(
                  CommonActions.reset({
                    index: 0,
                    routes: [{ name: 'DriverTabs' as any }],
                  })
                );
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Payment Received Successfully 🎉',
          `Delivery Completed!\n\nTotal Fare: ₹${gross}\nPlatform Fee (${commRate}%): -₹${comm}\nYour Net Earnings (${driverPct}%): ₹${net}\n\nRemaining Wallet Balance: ₹${finalRemainingWallet.toFixed(2)}`,
          [
            { 
              text: 'Return to Dashboard', 
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'DriverTabs' }],
                });
              } 
            }
          ]
        );
      }
    } catch (err: any) {
      setPaymentVerifying(false);
      Alert.alert('Payment Confirmation Failed', err?.message || 'Network error during payment confirmation. Please try again.');
    }
  };

  if (completed || completionState === 'success') {
    return (
      <View style={[styles.container, styles.completedContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="checkmark-circle" size={84} color={colors.success} style={{ marginBottom: 16 }} />
        <Text style={[styles.completedTitle, { color: colors.text }]}>✓ Delivery Completed</Text>
        <Text style={[styles.completedSub, { color: colors.textSecondary, marginBottom: 4 }]}>
          Order {displayOrderId}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 16, textAlign: 'center' }}>
          Successfully delivered to {customerName}
        </Text>
        <View style={{ backgroundColor: 'rgba(16,185,129,0.1)', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, marginBottom: 28, borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.success, textAlign: 'center' }}>
            ₹{fare} Earned
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: colors.primary, width: '100%', maxWidth: 320 }]}
          onPress={() => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'DriverTabs' }],
            });
          }}
        >
          <Text style={[styles.doneBtnText, { color: '#FFFFFF' }]}>Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDark = theme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('DriverTabs' as any)} style={{ marginRight: 16 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSub, { color: colors.primary }]}>Active Delivery</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{displayOrderId}</Text>
        </View>
        <View style={[styles.fareBadge, { 
          backgroundColor: theme === 'dark' ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.08)',
          borderColor: theme === 'dark' ? 'rgba(16,185,129,0.4)' : 'rgba(16,185,129,0.15)'
        }]}>
          <Text style={[styles.fareText, { color: colors.success }]}>₹{fare}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Uber / Rapido Styled Interactive Map Container */}
        <View style={[styles.mapContainer, { backgroundColor: isDark ? '#0F172A' : '#E0EBFF', borderColor: colors.border }]}>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={styles.mapView}
            customMapStyle={UBER_MAP_STYLE}
            initialRegion={{
              latitude: PICKUP_COORD.latitude,
              longitude: PICKUP_COORD.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            onPress={handleMapPress}
          >
            <Marker coordinate={PICKUP_COORD} title="Pickup" pinColor="#10B981" />
            <Marker coordinate={DROP_COORD} title="Drop" pinColor="#EF4444" />
            <Polyline coordinates={[PICKUP_COORD, DROP_COORD]} strokeColor="#0052FF" strokeWidth={4} />
          </MapView>

          {/* Uber/Rapido Vector Street Grid Overlay to prevent plain cream box */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject} opacity={isDark ? 0.35 : 0.65} pointerEvents="none">
            <Path d="M 0,20 L 500,20 M 0,50 L 500,50 M 0,80 L 500,80 M 0,110 L 500,110 M 0,140 L 500,140 M 0,170 L 500,170" stroke={isDark ? '#334155' : '#CBD5E1'} strokeWidth="1" />
            <Path d="M 30,0 L 30,220 M 80,0 L 80,220 M 130,0 L 130,220 M 180,0 L 180,220 M 230,0 L 230,220 M 280,0 L 280,220 M 330,0 L 330,220" stroke={isDark ? '#334155' : '#CBD5E1'} strokeWidth="1" />
            <Path d="M -20,160 L 380,20" stroke={isDark ? '#475569' : '#94A3B8'} strokeWidth="6" opacity="0.7" />
            <Path d="M 40,-10 L 320,210" stroke={isDark ? '#475569' : '#94A3B8'} strokeWidth="8" opacity="0.7" />
            <Path d="M 120,210 L 360,70" stroke={isDark ? '#475569' : '#94A3B8'} strokeWidth="5" opacity="0.7" />

            {/* Glowing Route Polyline */}
            <Path
              d="M 60,140 L 140,85 L 210,120 L 290,65"
              fill="none"
              stroke="#0052FF"
              strokeWidth="4.5"
              strokeDasharray="8,6"
            />
          </Svg>

          {/* Uber/Rapido Map Pins */}
          {/* Pickup Pin */}
          <View style={{ position: 'absolute', top: 120, left: 45, alignItems: 'center' }} pointerEvents="none">
            <View style={{ backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginBottom: 2 }}>
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>PICKUP</Text>
            </View>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' }}>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>P</Text>
            </View>
          </View>

          {/* Drop Pin */}
          <View style={{ position: 'absolute', top: 45, left: 270, alignItems: 'center' }} pointerEvents="none">
            <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginBottom: 2 }}>
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>DROP</Text>
            </View>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' }}>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 13 }}>D</Text>
            </View>
          </View>

          {/* Moving Bike Marker */}
          <View style={{ position: 'absolute', top: 75, left: 190, alignItems: 'center' }} pointerEvents="none">
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#0052FF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' }}>
              <MaterialCommunityIcons name="bike" size={18} color="#FFFFFF" />
            </View>
          </View>

          {/* Live Navigation ETA Badge */}
          <View style={styles.mapOverlayInfo}>
            <TouchableOpacity style={[styles.etaBadge, { backgroundColor: '#0052FF' }]} onPress={handleMapPress}>
              <Ionicons name="navigate" size={14} color="#FFFFFF" />
              <Text style={[styles.etaText, { color: '#FFFFFF' }]}>Start Navigation • ETA: 12 min</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Customer Info */}
        <View style={[styles.customerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.customerAvatar, { backgroundColor: colors.surface }]}>
            <Ionicons name="person" size={20} color={colors.primary} />
          </View>
          <View style={styles.customerInfo}>
            <Text style={[styles.customerName, { color: colors.text }]}>{customerName}</Text>
            <Text style={[styles.customerId, { color: colors.textSecondary }]}>Phone: {customerPhone}</Text>
          </View>
          <View style={styles.contactBtns}>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: 'rgba(16,185,129,0.15)' }]}
              onPress={() => {
                if (customerPhone && customerPhone.trim().length > 0) {
                  Linking.openURL(`tel:${customerPhone}`);
                } else {
                  Alert.alert('Notice', 'Customer phone number is not available for this order.');
                }
              }}
            >
              <Ionicons name="call" size={18} color={colors.success} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.contactBtn, { backgroundColor: theme === 'dark' ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)' }]}
              onPress={() => Alert.alert('Chat Support', `Opening chat with ${customerName}...`)}
            >
              <Ionicons name="chatbubble" size={18} color={colors.info} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Route Details */}
        <View style={[styles.routeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.routePoint}>
            <View style={[styles.routeMarker, { backgroundColor: colors.success }]}>
              <Ionicons name="location" size={12} color="#FFFFFF" />
            </View>
            <View style={styles.routeInfo}>
              <Text style={[styles.routeTypeLabel, { color: colors.textSecondary }]}>PICKUP</Text>
              <Text style={[styles.routeAddress, { color: colors.text }]}>{pickupAddress}</Text>
            </View>
            <TouchableOpacity 
              style={[styles.navBtn, { backgroundColor: theme === 'dark' ? 'rgba(0,82,255,0.2)' : 'rgba(0,82,255,0.08)' }]}
              onPress={() => Linking.openURL(`google.navigation:q=${encodeURIComponent(pickupAddress)}`)}
            >
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
          <View style={styles.routePoint}>
            <View style={[styles.routeMarker, { backgroundColor: colors.error }]}>
              <Ionicons name="flag" size={12} color="#FFFFFF" />
            </View>
            <View style={styles.routeInfo}>
              <Text style={[styles.routeTypeLabel, { color: colors.textSecondary }]}>DROP</Text>
              <Text style={[styles.routeAddress, { color: colors.text }]}>{dropAddress}</Text>
            </View>
            <TouchableOpacity 
              style={[styles.navBtn, { backgroundColor: theme === 'dark' ? 'rgba(0,82,255,0.2)' : 'rgba(0,82,255,0.08)' }]}
              onPress={() => Linking.openURL(`google.navigation:q=${encodeURIComponent(dropAddress)}`)}
            >
              <Ionicons name="navigate-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Progress Steps */}
        <View style={[styles.stepsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.stepsTitle, { color: colors.text }]}>Delivery Progress</Text>
          {STEPS.map((step, index) => (
            <View key={step.key} style={styles.stepRow}>
              <View style={styles.stepLeft}>
                <View style={[
                  styles.stepCircle,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  index < currentStep && [styles.stepDone, { backgroundColor: colors.success, borderColor: colors.success }],
                  index === currentStep && [styles.stepActive, { borderColor: colors.primary, backgroundColor: theme === 'dark' ? 'rgba(0,82,255,0.2)' : 'rgba(0,82,255,0.08)' }],
                ]}>
                  {index < currentStep ? (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.stepEmoji, { color: colors.primary }]}>{index === currentStep ? '•' : ''}</Text>
                  )}
                </View>
                {index < STEPS.length - 1 && (
                  <View style={[styles.stepConnector, { backgroundColor: colors.border }, index < currentStep && [styles.stepConnectorDone, { backgroundColor: colors.success }]]} />
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={[
                  styles.stepLabel, 
                  { color: colors.gray }, 
                  index === currentStep && [styles.stepLabelActive, { color: colors.text }]
                ]}>
                  {step.label}
                </Text>
                <Text style={[styles.stepDesc, { color: colors.textMuted }]}>{step.desc}</Text>
              </View>
              {index === currentStep && (
                <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.stepBadgeText, { color: '#FFFFFF' }]}>NOW</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Action Button: Swipe to Confirm */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <SwipeButton 
          title={STEPS[currentStep]?.label || 'Confirm Step'}
          iconName={STEPS[currentStep]?.iconName || 'checkmark-circle'}
          colors={colors}
          isTransitioning={isTransitioning}
          onComplete={handleStepComplete}
        />
      </View>

      {/* Customer Delivery OTP Modal */}
      <Modal visible={showOtpModal} transparent animationType="slide" onRequestClose={() => setShowOtpModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.modalIconBadge, { backgroundColor: theme === 'dark' ? 'rgba(0,82,255,0.2)' : 'rgba(0,82,255,0.1)' }]}>
              <Ionicons name="shield-checkmark" size={28} color={colors.primary} />
            </View>

            <Text style={[styles.modalTitle, { color: colors.text }]}>Customer Delivery OTP</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              Ask the customer for their 4-digit verification code to complete delivery.
            </Text>

            <View style={styles.modalOtpRow}>
              {deliveryOtp.map((digit, idx) => (
                <TextInput
                  key={idx}
                  ref={otpInputRefs[idx]}
                  style={[
                    styles.modalOtpBox,
                    { backgroundColor: colors.surface, borderColor: digit ? colors.primary : colors.border, color: colors.text }
                  ]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(val) => {
                    const newOtp = [...deliveryOtp];
                    newOtp[idx] = val;
                    setDeliveryOtp(newOtp);
                    if (val && idx < 3) otpInputRefs[idx + 1].current?.focus();
                  }}
                  onKeyPress={(e) => {
                    if (e.nativeEvent.key === 'Backspace' && !deliveryOtp[idx] && idx > 0) {
                      otpInputRefs[idx - 1].current?.focus();
                    }
                  }}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.modalVerifyBtn, { backgroundColor: colors.primary }]}
              onPress={handleVerifyDeliveryOtp}
              disabled={verifyingOtp}
            >
              {verifyingOtp ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalVerifyBtnText}>Verify OTP & Complete Delivery</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowOtpModal(false)}>
              <Text style={[styles.modalCancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Simplified Driver Payment Collection Modal */}
      <Modal visible={showPaymentQrModal} transparent animationType="slide" onRequestClose={() => setShowPaymentQrModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.paymentQrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Header Badge */}
            <View style={styles.qrHeaderRow}>
              <View style={[styles.qrIconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="wallet-outline" size={24} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[styles.qrTitle, { color: colors.text }]}>Payment Collection</Text>
                  <View style={styles.otpSuccessBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                    <Text style={styles.otpSuccessBadgeText}>OTP Verified</Text>
                  </View>
                </View>
                <Text style={[styles.qrSub, { color: colors.textMuted }]}>
                  Order #{displayOrderId}
                </Text>
              </View>
            </View>

            {/* Amount Due Section */}
            <View style={{ width: '100%', marginBottom: 16, backgroundColor: colors.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>Amount Due</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>₹{paymentDetails?.grossFare || fare}</Text>
            </View>

            {/* Payment Method Selector */}
            <Text style={{ width: '100%', fontSize: 13, color: colors.textSecondary, marginBottom: 8, fontWeight: '700' }}>Payment Method</Text>
            <View style={[styles.paymentMethodRow, { backgroundColor: colors.surface, marginBottom: 16 }]}>
              <TouchableOpacity
                style={[styles.paymentMethodTab, paymentMethod === 'cash' && { backgroundColor: colors.primary }]}
                onPress={() => setPaymentMethod('cash')}
              >
                <Ionicons name="cash-outline" size={16} color={paymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.paymentMethodTabText, { color: paymentMethod === 'cash' ? '#FFFFFF' : colors.textSecondary }]}>Cash</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.paymentMethodTab, paymentMethod === 'online' && { backgroundColor: colors.primary }]}
                onPress={() => setPaymentMethod('online')}
              >
                <Ionicons name="card-outline" size={16} color={paymentMethod === 'online' ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.paymentMethodTabText, { color: paymentMethod === 'online' ? '#FFFFFF' : colors.textSecondary }]}>Online</Text>
              </TouchableOpacity>
            </View>

            {/* Collected Amount TextInput */}
            <Text style={{ width: '100%', fontSize: 13, color: colors.textSecondary, marginBottom: 8, fontWeight: '700' }}>Collected Amount</Text>
            <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, marginBottom: 16, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 18, color: colors.text, fontWeight: '700', marginRight: 4 }}>₹</Text>
              <TextInput
                style={{
                  flex: 1,
                  height: 48,
                  fontSize: 18,
                  fontWeight: '700',
                  color: colors.text,
                }}
                value={collectedAmount}
                onChangeText={setCollectedAmount}
                keyboardType="numeric"
                placeholder="0.00"
              />
            </View>

            {/* Explanatory notices depending on selection */}
            {paymentMethod === 'cash' && (
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: 12, borderRadius: 12, marginBottom: 16, gap: 10 }}>
                <Ionicons name="information-circle" size={20} color="#10B981" />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 16 }}>
                  Customer paid physically via Cash. Please confirm you collected ₹{paymentDetails?.grossFare || fare}.
                </Text>
              </View>
            )}

            {paymentMethod === 'online' && (
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0, 82, 255, 0.1)', padding: 12, borderRadius: 12, marginBottom: 16, gap: 10 }}>
                <Ionicons name="information-circle" size={20} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 16 }}>
                  Customer paid online/electronically. Please confirm receipt of ₹{paymentDetails?.grossFare || fare}.
                </Text>
              </View>
            )}

            {!paymentMethod && (
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 12, borderRadius: 12, marginBottom: 16, gap: 10, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.textMuted} />
                <Text style={{ flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 16 }}>
                  Please select either Cash or Online to proceed with payment collection.
                </Text>
              </View>
            )}

            {/* Financial Ledger Breakdown */}
            <View style={[styles.ledgerCard, { backgroundColor: colors.surface, borderColor: colors.border, width: '100%', marginBottom: 16 }]}>
              <View style={styles.ledgerRow}>
                <Text style={[styles.ledgerLabel, { color: colors.textSecondary }]}>Gross Trip Fare</Text>
                <Text style={[styles.ledgerVal, { color: colors.text }]}>₹{(paymentDetails?.grossFare || fare).toFixed(2)}</Text>
              </View>
              <View style={styles.ledgerRow}>
                <Text style={[styles.ledgerLabel, { color: colors.textSecondary }]}>Platform Commission ({commRate}%)</Text>
                <Text style={[styles.ledgerVal, { color: '#EF4444' }]}>-₹{(paymentDetails?.commission || Math.round((paymentDetails?.grossFare || fare) * (commRate / 100))).toFixed(2)}</Text>
              </View>
              <View style={[styles.ledgerDivider, { backgroundColor: colors.border }]} />
              <View style={styles.ledgerRow}>
                <Text style={[styles.ledgerNetLabel, { color: colors.text }]}>Your Net Earnings</Text>
                <Text style={styles.ledgerNetVal}>₹{(paymentDetails?.netEarning || (paymentDetails?.grossFare || fare) - Math.round((paymentDetails?.grossFare || fare) * (commRate / 100))).toFixed(2)}</Text>
              </View>
            </View>

            {/* Settlement Action Buttons */}
            <TouchableOpacity
              style={[
                styles.modalVerifyBtn,
                {
                  backgroundColor: !paymentMethod 
                    ? colors.border 
                    : (paymentSuccessAnim ? '#059669' : colors.primary)
                }
              ]}
              onPress={handleSettlePayment}
              disabled={paymentVerifying || !paymentMethod}
            >
              {paymentSuccessAnim ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.modalVerifyBtnText}>Payment Verified & Completed! 🎉</Text>
                </View>
              ) : paymentVerifying ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.modalVerifyBtnText}>Confirming Payment...</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
                  <Text style={styles.modalVerifyBtnText}>Confirm Payment</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn} 
              onPress={() => {
                setShowPaymentQrModal(false);
                setPaymentMethod(null);
                setCollectedAmount('');
                setIsPaymentVerifiedByServer(false);
                setPaymentSuccessAnim(false);
              }}
              disabled={paymentVerifying}
            >
              <Text style={[styles.modalCancelBtnText, { color: colors.textSecondary }]}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// --- Custom Swipe Button Sub-Component ---
const SwipeButton = ({ title, iconName, colors, isTransitioning, onComplete }: any) => {
  const [completed, setCompleted] = useState(false);
  const translateX = React.useRef(new Animated.Value(0)).current;
  const isMounted = React.useRef(true);
  const buttonWidth = Dimensions.get('window').width - 40;
  const thumbWidth = 60;
  const swipeableWidth = buttonWidth - thumbWidth - 4;

  // FIX: Store onComplete and isTransitioning in refs so PanResponder
  // always calls the LATEST version, not the stale initial closure.
  const onCompleteRef = React.useRef(onComplete);
  const isTransitioningRef = React.useRef(isTransitioning);
  const completedRef = React.useRef(false);
  const swipeTriggered = React.useRef(false);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useEffect(() => {
    isTransitioningRef.current = isTransitioning;
  }, [isTransitioning]);

  React.useEffect(() => {
    completedRef.current = completed;
  }, [completed]);

  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !completedRef.current && !isTransitioningRef.current && !swipeTriggered.current,
      onMoveShouldSetPanResponder: () => !completedRef.current && !isTransitioningRef.current && !swipeTriggered.current,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0 && gestureState.dx < swipeableWidth) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > swipeableWidth * 0.65) {
          // Prevent duplicate triggers
          if (swipeTriggered.current) return;
          swipeTriggered.current = true;

          Animated.spring(translateX, {
            toValue: swipeableWidth,
            useNativeDriver: false,
          }).start(() => {
            if (isMounted.current) {
              setCompleted(true);
            }
            // Call the LATEST onComplete via ref, not the stale closure
            console.log('[DELIVERY] Swipe gesture completed, calling onComplete');
            try {
              onCompleteRef.current();
            } catch (e) {
              console.error('[DELIVERY] onComplete threw error:', e);
            }
            // Reset after delay for next step
            setTimeout(() => {
              if (isMounted.current) {
                setCompleted(false);
                swipeTriggered.current = false;
                translateX.setValue(0);
              }
            }, 1200);
          });
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={[styles.swipeContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.swipeText, { color: completed ? colors.success : colors.textSecondary }]}>
        {completed ? 'Confirmed!' : `Swipe to ${title}`}
      </Text>
      
      <Animated.View style={[styles.swipeBgFill, { width: translateX, backgroundColor: colors.success }]} />

      <Animated.View 
        style={[
          styles.swipeThumb, 
          { backgroundColor: completed ? colors.success : colors.primary, transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
      >
        <Ionicons name={completed ? 'checkmark' : (iconName as any)} size={24} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  completedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  completedTitle: {
    fontSize: 28,
    fontWeight: '800',
  },
  completedSub: {
    fontSize: 16,
    fontWeight: '600',
  },
  doneBtn: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  doneBtnText: {
    fontWeight: '700',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  fareBadge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  fareText: {
    fontWeight: '800',
    fontSize: 18,
  },
  mapContainer: {
    height: 180,
    marginHorizontal: 20,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  mapText: {
    fontWeight: '700',
    fontSize: 16,
  },
  mapSub: {
    fontSize: 12,
  },
  mapOverlayInfo: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  etaText: {
    fontWeight: '700',
    fontSize: 12,
  },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 14,
  },
  customerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  customerId: {
    fontSize: 12,
    marginTop: 2,
  },
  contactBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  contactBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCard: {
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
    gap: 12,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeMarker: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    fontSize: 13,
    fontWeight: '500',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLine: {
    height: 1,
    marginLeft: 42,
  },
  stepsCard: {
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 20,
    borderWidth: 1,
    gap: 0,
  },
  stepsTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 0,
  },
  stepLeft: {
    alignItems: 'center',
    width: 28,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stepDone: {},
  stepActive: {},
  stepEmoji: {
    fontSize: 16,
    fontWeight: '900',
  },
  stepConnector: {
    width: 2,
    height: 30,
    marginVertical: 4,
  },
  stepConnectorDone: {},
  stepContent: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: 20,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepLabelActive: {},
  stepDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
  },
  swipeContainer: {
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  swipeBgFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.15,
  },
  swipeText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    zIndex: 1,
  },
  swipeThumb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    position: 'absolute',
    left: 4,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  modalIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  modalOtpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  modalOtpBox: {
    width: 52,
    height: 58,
    borderRadius: 12,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
  },
  modalVerifyBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalVerifyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelBtn: {
    paddingVertical: 8,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  paymentQrCard: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  qrHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 14,
  },
  qrIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  otpSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  otpSuccessBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    marginLeft: 4,
  },
  qrSub: {
    fontSize: 12,
    marginTop: 2,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  paymentMethodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  paymentMethodTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  qrDisplayBox: {
    alignItems: 'center',
    marginVertical: 4,
  },
  qrImageWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  qrSuccessOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.96)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    zIndex: 10,
  },
  qrSuccessCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginBottom: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  qrSuccessText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  qrSuccessAmount: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  qrSuccessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  qrSuccessPillText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
  },
  upiRefText: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  qrInstructions: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  cashNoticeBox: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  cashNoticeTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  cashNoticeSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  ledgerCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginVertical: 10,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  ledgerLabel: {
    fontSize: 13,
  },
  ledgerVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  ledgerDivider: {
    height: 1,
    marginVertical: 8,
  },
  ledgerNetLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  ledgerNetVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#10B981',
  },
});

class CargoErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[CARGO] Error Boundary caught an unexpected render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0F172A' }}>
          <Ionicons name="warning-outline" size={64} color="#EF4444" style={{ marginBottom: 16 }} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            Unable to load this delivery step.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#0052FF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Retry Step</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const ActiveOrderScreenWrapped = (props: any) => (
  <CargoErrorBoundary>
    <ActiveOrderScreen {...props} />
  </CargoErrorBoundary>
);

export default ActiveOrderScreenWrapped;
