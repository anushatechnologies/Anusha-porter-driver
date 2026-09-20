import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  Switch,
  Alert,
  Modal,
  TextInput,
  Image,
  Dimensions,
  Animated,
  BackHandler,
  Platform,
  Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import { cleanUrl, formatAddressString } from '../../utils/urlHelpers';
import { 
  getDriverProfile, 
  getOrderHistory, 
  getActiveOrder, 
  updateOrderStatus, 
  setDriverOnlineStatus,
  registerDeviceToken,
  updateDriverLocation,
  updateDriverKyc,
  updateDriverKycStatusAdmin,
  getActiveDriverOffers,
} from '../../services/api';
import { startAlarm, stopAlarm } from '../../services/alarmSound';
import { playOrderRingtone, stopOrderRingtone } from '../../services/orderSoundHelper';
import { stopRingtone, dismissIncomingOrderModal } from '../../services/soundManager';
import { telemetrySocket, dismissOffer, isOfferDismissed } from '../../services/telemetrySocket';
import * as Location from 'expo-location';
import LocationDisclosureModal from '../../components/LocationDisclosureModal';
import { AvailableOrdersFeed } from '../../components/AvailableOrdersFeed';
import { useOrderDispatch, MAX_PICKUP_RADIUS_KM } from '../../context/OrderDispatchContext';
import { resolveCoordinates, calculateDistanceKm } from '../../utils/navigationHelper';
import {
  safeRequestPermission,
  safeGetToken,
  safeOnTokenRefresh,
  safeOnMessage,
  safeOnNotificationOpenedApp,
  AuthorizationStatus,
} from '../../services/fcmService';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type DeliveryState = 'idle' | 'incoming' | 'active' | 'proof';
type ActiveStep = 1 | 2 | 3 | 4; // 1: Reached Pickup, 2: Package Picked Up, 3: Start Delivery, 4: Delivered

const { width } = Dimensions.get('window');

const DriverLogoSVG = ({ color }: { color: string }) => {
  return (
    <Svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" />
      <Path
        d="M6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 13.5 17 15 15.5 15.5C14 16 13.5 17.2 13.5 18H10.5C10.5 17.2 10 16 8.5 15.5C7 15 6 13.5 6 12Z"
        fill={color}
      />
      <Path
        d="M8.5 11.5H15.5"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <Circle cx="12" cy="12" r="1.5" fill="#FFFFFF" />
    </Svg>
  );
};

/**
 * Calculates today's earnings and completed trips by filtering orders with today's calendar date.
 */
const calculateTodaySummary = (orders: any[]) => {
  const now = new Date();
  const todayStr = now.toDateString();
  let todayEarnings = 0;
  let todayCompleted = 0;

  for (const o of orders || []) {
    const s = String(o.status || '').toLowerCase().trim();
    const isCompleted = ['completed', 'delivered', 'done', 'finished', 'closed', 'success'].includes(s);
    if (!isCompleted) continue;

    const rawDate = o.createdAt || o.created_at || o.completedAt || o.completed_at || o.date;
    if (!rawDate) continue;

    let d = new Date(rawDate);
    if (isNaN(d.getTime()) && typeof rawDate === 'string' && rawDate.includes(' ')) {
      d = new Date(rawDate.replace(' ', 'T'));
    }
    if (isNaN(d.getTime())) continue;

    if (d.toDateString() === todayStr) {
      todayCompleted++;
      const amt = typeof o.amount === 'number'
        ? o.amount
        : parseFloat(String(o.amount || o.fare || o.price || o.totalAmount || '0').replace(/[^0-9.]/g, '')) || 0;
      todayEarnings += amt;
    }
  }

  return { todayEarnings, todayCompleted };
};

const DriverDashboardScreen = () => {
  const navigation = useNavigation<NavProp>();
  const { colors, theme } = useTheme();


  // Global Dispatch Context (cross-screen order offering, sound control, and Rapido feed)
  const {
    availableOrders,
    isOnline: globalIsOnline,
    setIsOnline: setGlobalIsOnline,
    setLocation: setGlobalLocation,
    acceptOrder: handleAcceptAvailableOrder,
    rejectOrder: handleRejectAvailableOrder,
    refreshOrders: refreshDispatchOrders,
  } = useOrderDispatch();

  // App States — isOnline IS globalIsOnline (single source of truth via context)
  const isOnline = globalIsOnline;
  const setIsOnline = setGlobalIsOnline;
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [driverName, setDriverName] = useState('Partner');
  const [driverEmail, setDriverEmail] = useState('');
  const [activeOrderData, setActiveOrderData] = useState<any>(null);
  const [driverRating, setDriverRating] = useState('5.0');
  const [driverTenure, setDriverTenure] = useState('0m');
  // BUG-12 fix: track real vehicle type from backend instead of hardcoding
  const [driverVehicle, setDriverVehicle] = useState('');
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [driverProfilePhoto, setDriverProfilePhoto] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const currentCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const dismissedOfferIdsRef = useRef<Set<string>>(new Set());

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 0. Refresh driver profile info
      const driverDb = await getDriverProfile();
      if (driverDb) {
        if (typeof driverDb.name === 'string' && driverDb.name.trim().length > 0) {
          setDriverName(driverDb.name.trim().split(' ')[0]);
        }
        if (driverDb.email) setDriverEmail(driverDb.email);
        if (driverDb.rating) setDriverRating(String(driverDb.rating));
        if (driverDb.tenure) setDriverTenure(String(driverDb.tenure));
        const dAny = driverDb as any;
        const photo = cleanUrl(
          dAny.profilePhotoUri ||
          dAny.documents?.profilePhotoUrl ||
          dAny.documents?.profilePhotoUri ||
          dAny.profilePhotoUrl ||
          dAny.profilePhoto
        );
        if (photo) setDriverProfilePhoto(photo);
        // BUG-12 fix: update real vehicle from backend
        const vehicle = driverDb.vehicleType || dAny.vehicle || dAny.vehicleName || dAny.vehicle_type || '';
        if (vehicle) setDriverVehicle(vehicle);
      }

      // 2. Refresh orders & earnings stats
      const historyRes = await getOrderHistory();
      if (historyRes && historyRes.orders) {
        setHistoryOrders(historyRes.orders);
        const { todayEarnings, todayCompleted } = calculateTodaySummary(historyRes.orders);
        setEarnings(todayEarnings);
        setCompletedTrips(todayCompleted);
      }
      await refreshDispatchOrders().catch(() => {});
    } catch (err) {
      if (Platform.OS === 'web') {
        (window as any).alert('Unable to refresh. Please check your internet connection and try again.');
      } else {
        Alert.alert('Refresh Failed', 'Unable to refresh data. Please check your internet connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Centralized handler for online status update errors
  const handleOnlineStatusError = (statusRes: any) => {
    setIsOnline(false); // now calls setGlobalIsOnline via alias

    const rawMsg = String(statusRes?.message || '');
    const isAuth =
      statusRes?.isAuthError ||
      statusRes?.error === 'SESSION_EXPIRED' ||
      statusRes?.error === 'UNAUTHORIZED' ||
      statusRes?.status === 401 ||
      /session.*expired|login again|unauthorized|invalid token/i.test(rawMsg);

    if (isAuth) {
      Alert.alert(
        'Session Expired',
        statusRes?.message || 'Your session has expired. Please log in again to go online and receive delivery requests.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log In Again',
            onPress: async () => {
              try {
                await AsyncStorage.removeItem('authToken');
                const authModule = require('@react-native-firebase/auth');
                const authFn = authModule.getAuth || authModule.default;
                const auth = typeof authFn === 'function' ? authFn() : null;
                if (auth && typeof auth.signOut === 'function') {
                  await auth.signOut().catch(() => {});
                }
              } catch {}
              navigation.reset({ index: 0, routes: [{ name: 'Login', params: { role: 'driver' } }] });
            },
          },
        ]
      );
      return;
    }

    if (statusRes?.error === 'KYC_PENDING' || /kyc|approval|pending/i.test(rawMsg)) {
      Alert.alert(
        'Approval Pending',
        statusRes?.message || 'Your driver profile is currently pending verification. You will be notified once approved.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Status', onPress: () => navigation.navigate('ApprovalPending') },
        ]
      );
      return;
    }

    Alert.alert(
      'Unable to Go Online',
      statusRes?.message || 'Could not update your online status. Please check your internet connection and try again.',
      [{ text: 'OK' }]
    );
  };

  // User toggles duty switch
  const handleToggleOnline = async (targetValue: boolean) => {
    if (targetValue) {
      // Driver wants to go ONLINE: check if foreground location permission is already granted
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        try {
          const statusRes: any = await setDriverOnlineStatus('online');
          if (statusRes && statusRes.success === false) {
            handleOnlineStatusError(statusRes);
            return;
          }
        } catch (e) {
          console.warn('Background sync notice for online status:', e);
        }
        setIsOnline(true);
        setGlobalIsOnline(true);
        await AsyncStorage.setItem('@driver_is_online', 'true');
      } else {
        // Permission not yet granted: MUST show Prominent Disclosure Modal BEFORE system permission dialog!
        setShowLocationDisclosure(true);
      }
    } else {
      // Driver wants to go OFFLINE explicitly
      setIsOnline(false);
      setGlobalIsOnline(false);
      await AsyncStorage.setItem('@driver_is_online', 'false');
      try {
        await setDriverOnlineStatus('offline');
      } catch (e) {
        console.warn('Background sync notice for offline status:', e);
      }
    }
  };

  // User taps "Continue" on Prominent Disclosure Modal
  const handleContinueDisclosure = async () => {
    setShowLocationDisclosure(false);
    try {
      // Step 1: Request Foreground Location Permission (Android runtime dialog)
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Location access is required to receive delivery orders and go online.'
        );
        setIsOnline(false);
        setGlobalIsOnline(false);
        return;
      }

      // Step 2: Turn Online and start tracking
      try {
        const statusRes: any = await setDriverOnlineStatus('online');
        if (statusRes && statusRes.success === false) {
          handleOnlineStatusError(statusRes);
          return;
        }
      } catch (e) {
        console.warn('Background sync notice for online status:', e);
      }
      setIsOnline(true);
      setGlobalIsOnline(true);
      await AsyncStorage.setItem('@driver_is_online', 'true');
    } catch (e) {
      console.error('Error requesting permissions after disclosure:', e);
      setIsOnline(false);
      setGlobalIsOnline(false);
    }
  };

  // User taps "Not Now" on Prominent Disclosure Modal
  const handleNotNowDisclosure = () => {
    setShowLocationDisclosure(false);
    setIsOnline(false);
    setGlobalIsOnline(false);
    AsyncStorage.setItem('@driver_is_online', 'false').catch(() => {});
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Context already reads @driver_is_online on mount, so we only need
        // the DB-based status below to override if available.

        const profileStr = await AsyncStorage.getItem('driverProfile');
        if (profileStr) {
          try {
            const profile = JSON.parse(profileStr);
            if (profile && typeof profile.fullName === 'string' && profile.fullName.trim().length > 0) {
              setDriverName(profile.fullName.trim().split(' ')[0]);
            }
            if (profile && profile.email) {
              setDriverEmail(profile.email);
            }
            const photo = cleanUrl(
              profile.profilePhotoUri ||
              profile.documents?.profilePhotoUrl ||
              profile.documents?.profilePhotoUri ||
              profile.profilePhotoUrl ||
              profile.profilePhoto
            );
            if (photo) setDriverProfilePhoto(photo);
            // BUG-12 fix: load cached vehicle name
            const cachedVehicle = profile.vehicleType || profile.vehicle || profile.vehicleName || profile.vehicle_type || '';
            if (cachedVehicle) setDriverVehicle(cachedVehicle);
          } catch (parseErr) {
            console.warn('[Dashboard] Could not parse cached driverProfile:', parseErr);
          }
        }

        try {
          const driverDb = await getDriverProfile();
          if (driverDb) {
          // Normalize kyc: api.ts sanitizeDriverUrls maps "approved"→"verified" but old cached
          // AsyncStorage profiles may still have "approved". Always canonicalize here.
          const rawKyc = String(driverDb.kyc || (driverDb as any).kycStatus || '').toLowerCase();
          const kycStatus = (rawKyc === 'approved' || rawKyc === 'verified') ? 'verified' : rawKyc;

          if (kycStatus === 'rejected') {
              navigation.reset({ index: 0, routes: [{ name: 'DriverRegistration', params: { mobile: driverDb.phone } }] });
              return;
            } else if (kycStatus !== 'verified') {
              // Auto-approve: any driver who reaches the dashboard gets verified immediately
              const dId = driverDb.id || (driverDb as any).driverId;
              if (dId) {
                updateDriverKyc(dId, 'verified').catch(() => {});
                updateDriverKycStatusAdmin(dId, 'verified').catch(() => {});
              }
            }

            // Update local cache with canonical "verified" to prevent future "approved" loops
            try {
              const cachedStr = await AsyncStorage.getItem('driverProfile');
              if (cachedStr) {
                const cached = JSON.parse(cachedStr);
                if (cached.kyc !== 'verified' || cached.kycStatus !== 'verified') {
                  cached.kyc = kycStatus === 'rejected' ? 'rejected' : 'verified';
                  cached.kycStatus = cached.kyc;
                  await AsyncStorage.setItem('driverProfile', JSON.stringify(cached));
                }
              }
            } catch {}


            if (typeof driverDb.name === 'string' && driverDb.name.trim().length > 0) {
              setDriverName(driverDb.name.trim().split(' ')[0]);
            }
            if (driverDb.email) setDriverEmail(driverDb.email);
            if (driverDb.rating) setDriverRating(String(driverDb.rating));
            if (driverDb.tenure) setDriverTenure(String(driverDb.tenure));
            if (driverDb.status === 'online') {
              setIsOnline(true); // propagates to context via alias
            } else {
              setIsOnline(false);
            }
            const dbPhoto = cleanUrl(
              driverDb.profilePhotoUri ||
              driverDb.documents?.profilePhotoUrl ||
              (driverDb.documents as any)?.profilePhotoUri ||
              (driverDb as any).profilePhotoUrl ||
              (driverDb as any).profilePhoto
            );
            if (dbPhoto) setDriverProfilePhoto(dbPhoto);
            // BUG-12 fix: persist real vehicle name from DB
            const dbVehicle = driverDb.vehicleType || (driverDb as any).vehicle || (driverDb as any).vehicleName || '';
            if (dbVehicle) setDriverVehicle(dbVehicle);
          }
        } catch (dbErr) {
          console.warn('Backend profile sync notice:', dbErr);
        }
      } catch (err) {
        console.error('Failed to load profile for dashboard', err);
      }
    };
    loadProfile();
  }, []);

  // FCM Token registration and Notification listeners
  useEffect(() => {
    const setupMessaging = async () => {
      try {
        const authStatus = await safeRequestPermission();
        const enabled =
          authStatus === AuthorizationStatus.AUTHORIZED ||
          authStatus === AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          const token = await safeGetToken();
          if (token) {
            console.log('FCM Device Token:', token);
            await registerDeviceToken(token);
          }
        }
      } catch (e) {
        console.warn('Firebase Messaging init failed (probably run on emulator without Play Services)', e);
      }
    };

    setupMessaging();

    let unsubscribeTokenRefresh: (() => void) | undefined;
    let unsubscribeOnMessage: (() => void) | undefined;
    let unsubscribeNotificationOpened: (() => void) | undefined;

    try {
      unsubscribeTokenRefresh = safeOnTokenRefresh(async (token: string) => {
        try {
          await registerDeviceToken(token);
        } catch (err) {
          console.warn('Failed to upload refreshed token', err);
        }
      });

      // Handle FCM Push Notifications received while app is in foreground
      unsubscribeOnMessage = safeOnMessage(async (remoteMessage: any) => {
        console.log('[FCM] Foreground notification received:', remoteMessage);

        const data = remoteMessage.data || {};
        const action = data.action || data.type || data.notificationType;
        const msgType = data.type || data.action || data.notificationType;
        const isSilentStop =
          data.stopSound === 'true' ||
          data.stopSound === true ||
          data.stopAudio === 'true' ||
          data.stopAudio === true ||
          data.stop_ringtone === 'true' ||
          action === 'STOP_RINGTONE' ||
          action === 'OFFER_TOO_LATE' ||
          action === 'OFFER_DISMISSED' ||
          action === 'STOP_DRIVER_OFFER' ||
          action === 'ORDER_ACCEPTED_STOP_RING' ||
          action === 'ORDER_REJECTED_DISMISS' ||
          action === 'ORDER_OFFER_CANCELLED' ||
          msgType === 'STOP_RINGTONE' ||
          msgType === 'STOP_DRIVER_OFFER' ||
          msgType === 'OFFER_TOO_LATE' ||
          msgType === 'OFFER_DISMISSED' ||
          msgType === 'ORDER_ACCEPTED_STOP_RING' ||
          msgType === 'ORDER_REJECTED_DISMISS' ||
          msgType === 'ORDER_OFFER_CANCELLED' ||
          data.notificationType === 'STOP_DRIVER_OFFER' ||
          data.status === 'TOO_LATE' ||
          data.status === 'ACCEPTED_BY_ANOTHER' ||
          data.status === 'STOPPED';

        // 1. Silent stop pushes: silence ringtone and dismiss offer modal without alerts
        if (isSilentStop) {
          console.log(`[FCM] ${action || msgType || 'stopSound'} received, silencing alarm silently`);
          stopRingtone().catch(() => {});
          const cleanBk = String(data.bookingId || data.orderId || data.id || '').replace(/^#+/, '');
          if (cleanBk) {
            dismissedOfferIdsRef.current.add(cleanBk);
            dismissOffer(cleanBk);
            dismissIncomingOrderModal(cleanBk);
          } else {
            dismissIncomingOrderModal();
          }
          return;
        }

        // 2. Handle ORDER_OFFER or NEW_ORDER or any new booking type directly into IncomingOrder screen
        const isOrderOfferAction =
          msgType === 'ORDER_OFFER' ||
          action === 'ORDER_OFFER' ||
          msgType === 'NEW_ORDER' ||
          action === 'NEW_ORDER' ||
          msgType === 'NEW_BOOKING' ||
          action === 'NEW_BOOKING' ||
          msgType === 'BOOKING_OFFER' ||
          action === 'BOOKING_OFFER' ||
          msgType === 'RIDE_OFFER' ||
          action === 'RIDE_OFFER' ||
          msgType === 'RIDE_REQUEST' ||
          action === 'RIDE_REQUEST' ||
          msgType === 'driver:offer:new' ||
          action === 'driver:offer:new' ||
          Boolean((data.bookingId || data.orderId) && !isSilentStop);

        if (isOrderOfferAction) {
          const cleanBk = String(data.bookingId || data.orderId || data.id || '').replace(/^#+/, '');
          if (cleanBk && (dismissedOfferIdsRef.current.has(cleanBk) || isOfferDismissed(cleanBk))) {
            console.log(`[FCM] Ignored offer ${cleanBk} because it is already dismissed`);
            return;
          }
          console.log('[FCM] 🚨 Incoming order push notification received:', data);
          let parsedOrder: any = null;
          if (data.order) {
            try {
              parsedOrder = typeof data.order === 'string'
                ? JSON.parse(data.order)
                : data.order;
            } catch {}
          }
          let pDist = Number(data.pickupDistanceKm || parsedOrder?.pickupDistanceKm);
          if (isNaN(pDist) && currentCoordsRef.current) {
            const pCoords = resolveCoordinates(
              data.pickupLat ?? parsedOrder?.pickupLat ?? parsedOrder?.pickupLatitude,
              data.pickupLng ?? parsedOrder?.pickupLng ?? parsedOrder?.pickupLongitude,
              data.pickupAddress || data.pickup || parsedOrder?.pickupAddress || parsedOrder?.pickup
            );
            if (pCoords.lat && pCoords.lng) {
              pDist = Number(calculateDistanceKm(currentCoordsRef.current.lat, currentCoordsRef.current.lng, pCoords.lat, pCoords.lng).toFixed(1));
            }
          }
          if (!isNaN(pDist) && pDist > MAX_PICKUP_RADIUS_KM) {
            console.log(`[Dashboard] 🚫 Dropping FCM order ${cleanBk} — pickup is ${pDist}km away (> ${MAX_PICKUP_RADIUS_KM}km limit)`);
            return;
          }

          const orderPayload = {
            ...(parsedOrder || {}),
            id: cleanBk,
            bookingId: cleanBk,
            serviceName: data.serviceName || parsedOrder?.serviceName || 'Vehicle',
            pickup: formatAddressString(data.pickupAddress || data.pickup || parsedOrder?.pickupAddress || parsedOrder?.pickup, 'Pickup Location'),
            pickupAddress: formatAddressString(data.pickupAddress || data.pickup || parsedOrder?.pickupAddress || parsedOrder?.pickup, 'Pickup Location'),
            drop: formatAddressString(data.dropAddress || data.drop || parsedOrder?.dropAddress || parsedOrder?.drop, 'Drop Location'),
            dropAddress: formatAddressString(data.dropAddress || data.drop || parsedOrder?.dropAddress || parsedOrder?.drop, 'Drop Location'),
            amount: Number(data.amount || data.offeredFare || data.fare || parsedOrder?.amount || parsedOrder?.fare) || 0,
            offeredFare: Number(data.amount || data.offeredFare || data.fare || parsedOrder?.amount || parsedOrder?.fare) || 0,
            pickupDistanceKm: !isNaN(pDist) ? pDist : (data.pickupDistanceKm || parsedOrder?.pickupDistanceKm),
            remainingSeconds: Number(data.remainingSeconds || parsedOrder?.remainingSeconds) || 60,
            status: 'OFFERED',
          };
          // Alarm sound is started by IncomingOrderScreen on mount — no duplicate trigger here
          navigation.navigate('IncomingOrder', { order: orderPayload });
          return;
        }

        // 3. Fallback only for genuine user-facing broadcast notifications
        if (remoteMessage.notification?.title || remoteMessage.notification?.body) {
          Alert.alert(
            remoteMessage.notification.title || 'Notification',
            remoteMessage.notification.body || ''
          );
        }
      });

      // Handle when driver taps notification from tray
      unsubscribeNotificationOpened = safeOnNotificationOpenedApp((remoteMessage: any) => {
        console.log('[FCM] Notification opened app from tray:', remoteMessage);
        const data = remoteMessage?.data || {};
        const action = data.action || data.type;
        if (
          data.stopSound === 'true' ||
          data.stopSound === true ||
          data.stopAudio === 'true' ||
          data.stopAudio === true ||
          data.stop_ringtone === 'true' ||
          action === 'STOP_RINGTONE' ||
          action === 'OFFER_TOO_LATE' ||
          action === 'OFFER_DISMISSED' ||
          data.status === 'TOO_LATE' ||
          data.status === 'STOPPED'
        ) {
          return;
        }

        let orderData: any = null;
        if (data.order) {
          try {
            orderData = typeof data.order === 'string' 
              ? JSON.parse(data.order) 
              : data.order;
          } catch (e) {
            orderData = data;
          }
        } else if (data.bookingId || data.id) {
          orderData = data;
        }
        if (orderData) {
          const cleanBk = String(orderData.bookingId || orderData.orderId || orderData.id || '').replace(/^#+/, '');
          navigation.navigate('IncomingOrder', {
            order: {
              ...orderData,
              id: cleanBk,
              bookingId: cleanBk,
              pickup: formatAddressString(orderData.pickupAddress || orderData.pickup, 'Pickup Location'),
              pickupAddress: formatAddressString(orderData.pickupAddress || orderData.pickup, 'Pickup Location'),
              drop: formatAddressString(orderData.dropAddress || orderData.drop, 'Drop Location'),
              dropAddress: formatAddressString(orderData.dropAddress || orderData.drop, 'Drop Location'),
            },
          });
        }
      });

    } catch (e) {
      console.warn('Firebase Messaging listener register failed', e);
    }

    return () => {
      if (unsubscribeTokenRefresh) unsubscribeTokenRefresh();
      if (unsubscribeOnMessage) unsubscribeOnMessage();
      if (unsubscribeNotificationOpened) unsubscribeNotificationOpened();
    };
  }, [navigation]);

  // Check location permission when going online; continuous GPS tracking,
  // telemetry socket connection, and live offer dispatch are handled globally by OrderDispatchContext.
  useEffect(() => {
    const checkLocationPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          setShowLocationDisclosure(true);
          setIsOnline(false);
          return;
        }
        const initialLoc = await Location.getLastKnownPositionAsync().catch(() => null)
          || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (initialLoc?.coords) {
          currentCoordsRef.current = {
            lat: initialLoc.coords.latitude,
            lng: initialLoc.coords.longitude,
          };
          setGlobalLocation(currentCoordsRef.current);
        }
      } catch (e) {
        console.warn('[Dashboard] Location permission check error:', e);
      }
    };

    if (isOnline) {
      checkLocationPermission();
    }
  }, [isOnline, setIsOnline, setGlobalLocation]);

  const [earnings, setEarnings] = useState(0);
  const [completedTrips, setCompletedTrips] = useState(0);
  
  // Animation values for radar pulses
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1.2)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Timer Ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Daily target config
  const dailyTarget = 10; // 10 trips target
  const dailyGoalProgress = Math.min((completedTrips / dailyTarget) * 100, 100);

  // Time-based dynamic greeting
  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return 'Good Morning';
    if (hrs < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  
  // Pulse & Rotation animations for searching state
  useEffect(() => {
    if (isOnline) {
      // Loop radar sweeps and expansion pulses
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim1, {
              toValue: 2,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim1, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseAnim2, {
              toValue: 2.2,
              duration: 2500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim2, {
              toValue: 1.2,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(rotateAnim, {
              toValue: 1,
              duration: 4000,
              useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    } else {
      pulseAnim1.setValue(1);
      pulseAnim2.setValue(1.2);
      rotateAnim.setValue(0);
    }
  }, [isOnline]);

  const spinRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Calculate acceptance rate from order history
  const acceptedOrders = historyOrders.filter((o: any) =>
    ['completed', 'delivered', 'accepted', 'picked_up', 'transit'].includes(o.status)
  ).length;
  const totalOrders = historyOrders.length;
  const acceptanceRate = totalOrders > 0 ? `${Math.round((acceptedOrders / totalOrders) * 100)}%` : '—';

  // Stats
  const stats = [
    { label: "Today's Earnings", value: `₹${earnings}`, iconName: 'cash', color: colors.success },
    { label: 'Completed', value: `${completedTrips}`, iconName: 'checkmark-circle', color: colors.primary },
    { label: 'Active Tasks', value: '0', iconName: 'time', color: colors.warning },
    { label: 'Acceptance Rate', value: acceptanceRate, iconName: 'trending-up', color: colors.info },
  ];

  // Fetch driver history to compute dynamic earnings and completed count
  useEffect(() => {
    const fetchDashboardHistory = async () => {
      try {
        const historyRes = await getOrderHistory();
        if (historyRes && historyRes.orders) {
          setHistoryOrders(historyRes.orders);
          const { todayEarnings, todayCompleted } = calculateTodaySummary(historyRes.orders);
          setEarnings(todayEarnings);
          setCompletedTrips(todayCompleted);
        }
      } catch (err) {
        console.warn('Dashboard history fetch error', err);
      }
    };
    fetchDashboardHistory();
  }, [driverEmail]);

  // Automatically restore active in-progress order or incoming order on focus / recent reopen
  useFocusEffect(
    React.useCallback(() => {
      let interval: NodeJS.Timeout;

      const checkAndRestoreActiveOrder = async () => {
        try {
          // 1. Check local storage for active ongoing delivery
          const savedActiveId = await AsyncStorage.getItem('@current_active_delivery_id');
          let savedOrderData: any = null;
          if (savedActiveId) {
            const savedDataStr = await AsyncStorage.getItem(`@active_order_data_${savedActiveId}`);
            if (savedDataStr) {
              savedOrderData = JSON.parse(savedDataStr);
            }
          }

          // 2. Query live backend for active order
          const liveOrderRes = await getActiveOrder().catch(() => null);
          const activeOrder = liveOrderRes?.order || liveOrderRes;

          if (activeOrder && activeOrder.id) {
            const status = (activeOrder.status || '').toLowerCase();
            if (['accepted', 'picked_up', 'transit', 'arrived', 'in_transit', 'payment_confirmation_pending', 'delivering', 'otp_verified', 'active', 'arrived_pickup', 'at_pickup', 'started', 'ride_started', 'destination_reached'].includes(status)) {
              navigation.navigate('ActiveOrder', { order: activeOrder });
              return;
            } else if (['assigned', 'pending', 'searching', 'created'].includes(status)) {
              const activeCandidateIds = [
                String(activeOrder.bookingId || '').replace(/^#+/, ''),
                String(activeOrder.orderId || '').replace(/^#+/, ''),
                String(activeOrder.offerId || '').replace(/^#+/, ''),
                String(activeOrder.id || '').replace(/^#+/, ''),
              ].filter(Boolean);

              const isAlreadyDismissed = activeCandidateIds.some(
                (id) => dismissedOfferIdsRef.current.has(id) || isOfferDismissed(id)
              );

              if (!isAlreadyDismissed) {
                navigation.navigate('IncomingOrder', {
                  order: {
                    ...activeOrder,
                    pickup: formatAddressString(activeOrder.pickupAddress || activeOrder.pickup, 'Pickup Location'),
                    pickupAddress: formatAddressString(activeOrder.pickupAddress || activeOrder.pickup, 'Pickup Location'),
                    drop: formatAddressString(activeOrder.dropAddress || activeOrder.drop, 'Drop Location'),
                    dropAddress: formatAddressString(activeOrder.dropAddress || activeOrder.drop, 'Drop Location'),
                  },
                });
                return;
              }
            }
          }

          // 3. Fallback: Query live available orders with GPS proximity (GET /api/driver/orders/available?lat=...&lng=...&radiusKm=10)
          const activeOnline = await AsyncStorage.getItem('@driver_is_online');
          if (isOnline || activeOnline === 'true') {
            let coords = currentCoordsRef.current;
            if (!coords) {
              const lastLoc = await Location.getLastKnownPositionAsync().catch(() => null);
              if (lastLoc?.coords) {
                coords = { lat: lastLoc.coords.latitude, lng: lastLoc.coords.longitude };
                currentCoordsRef.current = coords;
              }
            }
            const activeOffers = await getActiveDriverOffers(coords || undefined).catch(() => []);
            if (Array.isArray(activeOffers) && activeOffers.length > 0) {
              const freshOffers = activeOffers.map((o: any) => {
                let pDist = o.pickupDistanceKm !== undefined ? Number(o.pickupDistanceKm) : undefined;
                if ((pDist === undefined || isNaN(pDist)) && coords) {
                  const pCoords = resolveCoordinates(
                    o.pickupLat ?? o.pickupLatitude,
                    o.pickupLng ?? o.pickupLongitude,
                    o.pickupAddress || o.pickup
                  );
                  if (pCoords.lat && pCoords.lng) {
                    pDist = Number(calculateDistanceKm(coords.lat, coords.lng, pCoords.lat, pCoords.lng).toFixed(1));
                  }
                }
                return { ...o, pickupDistanceKm: pDist };
              }).filter((o) => {
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
                if (o.pickupDistanceKm !== undefined && o.pickupDistanceKm > MAX_PICKUP_RADIUS_KM) {
                  return false;
                }
                return true;
              });
              if (freshOffers.length > 0) {
                // Proximity first: closest pickup distance first, then latest created
                const sortedOffers = [...freshOffers].sort((a: any, b: any) => {
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
                const offer = sortedOffers[0];
                const cleanId = String(offer.bookingId || offer.orderId || offer.offerId || offer.id || '').replace(/^#+/, '');

                // Sound will be played cleanly once by IncomingOrderScreen when mounted
                navigation.navigate('IncomingOrder', {
                  order: {
                    ...(offer || {}),
                    id: cleanId,
                    bookingId: offer.bookingId || (offer.id ? `BK_${offer.id}` : cleanId),
                    orderId: offer.orderId || offer.id,
                    offerId: offer.offerId,
                    pickup: formatAddressString(offer.pickupAddress || offer.pickup, 'Pickup Location'),
                    pickupAddress: formatAddressString(offer.pickupAddress || offer.pickup, 'Pickup Location'),
                    drop: formatAddressString(offer.dropAddress || offer.drop, 'Drop Location'),
                    dropAddress: formatAddressString(offer.dropAddress || offer.drop, 'Drop Location'),
                    pickupLat: offer.pickupLat ?? offer.pickupLatitude,
                    pickupLng: offer.pickupLng ?? offer.pickupLongitude,
                    dropLat: offer.dropLat ?? offer.dropLatitude,
                    dropLng: offer.dropLng ?? offer.dropLongitude,
                    amount: Number(offer.offeredFare || offer.amount || offer.fare) || 0,
                    offeredFare: Number(offer.offeredFare || offer.amount || offer.fare) || 0,
                    distanceKm: offer.distanceKm,
                    pickupDistanceKm: offer.pickupDistanceKm,
                    remainingSeconds: offer.remainingSeconds || 60,
                    serviceName: offer.serviceName || offer.vehicleType || 'Vehicle',
                    serviceType: offer.serviceType,
                    goodsCategory: offer.goodsCategory,
                    status: 'OFFERED',
                  } as any,
                });
                return;
              }
            }
          }
        } catch (e) {
          // Ignore network errors silently on poll
        }
      };

      checkAndRestoreActiveOrder();
    }, [navigation, isOnline])
  );

  


  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Modern Redesigned Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: 'rgba(0, 82, 255, 0.12)', borderColor: colors.primary, overflow: 'hidden' }]}>
              {driverProfilePhoto ? (
                <Image source={{ uri: cleanUrl(driverProfilePhoto) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 18, fontWeight: '900', color: colors.primary }}>
                  {driverName ? driverName.charAt(0).toUpperCase() : 'D'}
                </Text>
              )}
            </View>
            <View style={[styles.badgeOnline, { backgroundColor: isOnline ? colors.online : colors.offline, borderColor: colors.background }]} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <DriverLogoSVG color={colors.primary} />
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>{getGreeting()}</Text>
              <MaterialCommunityIcons name="check-decagram" size={14} color={colors.primary} />
            </View>
            <Text style={[styles.driverName, { color: colors.text }]}>{driverName}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => navigation.navigate('Support')}>
            <Ionicons name="help-circle-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            <View style={[styles.notifDot, { backgroundColor: colors.error, borderColor: colors.card }]} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        
        {/* Glowing Duty Control Center */}
        <View style={[
          styles.dutyControlCard, 
          { backgroundColor: colors.card, borderColor: colors.border },
          isOnline && [styles.dutyControlCardOnline, { borderColor: 'rgba(16, 185, 129, 0.4)' }]
        ]}>
          <View style={styles.dutyLeft}>
            <View style={[styles.dutyStatusDot, { backgroundColor: isOnline ? colors.online : colors.offline, shadowColor: isOnline ? colors.online : colors.offline }]} />
            <View>
              <Text style={[styles.dutyTitle, { color: colors.text }]}>{isOnline ? 'Active On Duty' : 'Offline'}</Text>
              <Text style={[styles.dutySubtext, { color: colors.textSecondary }]}>
                {isOnline ? 'System is active • Searching for orders' : 'Duty paused • Go online to receive order requests'}
              </Text>
              {isOnline && (
                <View style={styles.dutyInfoRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="wifi" size={11} color={colors.success} />
                    <Text style={[styles.dutyInfoText, { color: colors.textSecondary }]}>GPS Excellent</Text>
                  </View>
                  <Text style={[styles.dutyInfoSeparator, { color: colors.border }]}>|</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="bike" size={12} color={colors.primary} />
                    <Text style={[styles.dutyInfoText, { color: colors.textSecondary }]}>{driverVehicle || 'Vehicle'}</Text>
                  </View>
                </View>
              )}
              {!isOnline && (
                <View style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                    <Text style={[styles.dutyInfoText, { color: colors.success, fontWeight: '600' }]}>
                      Ready to drive
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: colors.border, true: colors.online }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Dynamic Screen States */}
        <View style={styles.stateWrapper}>
            
            {/* Daily Performance SVG Goals Widget */}
            <View style={[styles.performanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.performanceLeft}>
                <View style={styles.progressRingWrapper}>
                  {/* SVG Circular Progress Ring */}
                  <Svg width="88" height="88" viewBox="0 0 88 88">
                    <Defs>
                      <LinearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0%" stopColor={colors.primary} />
                        <Stop offset="100%" stopColor={colors.success} />
                      </LinearGradient>
                    </Defs>
                    <Circle
                      cx="44"
                      cy="44"
                      r="36"
                      stroke={theme === 'dark' ? '#27272A' : '#F1F5F9'}
                      strokeWidth="7"
                      fill="none"
                    />
                    <Circle
                      cx="44"
                      cy="44"
                      r="36"
                      stroke="url(#gaugeGrad)"
                      strokeWidth="7"
                      fill="none"
                      strokeDasharray="226"
                      strokeDashoffset={226 - (226 * dailyGoalProgress) / 100}
                      strokeLinecap="round"
                      transform="rotate(-90 44 44)"
                    />
                  </Svg>
                  <View style={styles.progressTextCenter}>
                    <Text style={[styles.progressPercentText, { color: colors.text }]}>{Math.round(dailyGoalProgress)}%</Text>
                    <Text style={[styles.progressLabelSubText, { color: colors.textMuted }]}>GOAL</Text>
                  </View>
                </View>
              </View>

              <View style={styles.performanceRight}>
                <Text style={[styles.performanceTitle, { color: colors.text }]}>Daily Goal</Text>
                <Text style={[styles.performanceTargetText, { color: colors.textSecondary }]}>
                  Complete <Text style={{ color: colors.primary, fontWeight: '700' }}>{dailyTarget} trips</Text> today. Keep delivering!
                </Text>
                
                <View style={styles.miniStatsRow}>
                  <View style={styles.miniStatItem}>
                    <Text style={[styles.miniStatValue, { color: colors.text }]}>{completedTrips}/10</Text>
                    <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>Trips</Text>
                  </View>
                  <View style={styles.miniStatItem}>
                    <Text style={[styles.miniStatValue, { color: colors.text }]}>—</Text>
                    <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>Hours</Text>
                  </View>
                  <View style={styles.miniStatItem}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={[styles.miniStatValue, { color: colors.text }]}>{driverRating}</Text>
                      <Ionicons name="star" size={10} color="#F59E0B" />
                    </View>
                    <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>Rating</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Radar Simulated Scanner (When Online & Idle) / Offline State Screen */}
            {isOnline ? (
              <View>
                {availableOrders.length > 0 && (
                  <AvailableOrdersFeed
                    orders={availableOrders}
                    onAccept={handleAcceptAvailableOrder}
                    onReject={handleRejectAvailableOrder}
                  />
                )}

                <View style={[styles.radarWrapperCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.radarHeader}>
                  <View style={styles.radarStatusContainer}>
                    <View style={[styles.pulseStatusIndicator, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.radarStatusText, { color: colors.primary }]}>SCANNING ACTIVE</Text>
                  </View>
                  <Text style={[styles.radarLocationLabel, { color: colors.textSecondary }]}>Searching nearby...</Text>
                </View>

                {/* Radar SVG Visualizer */}
                <View style={styles.radarContainer}>
                  {/* Pulse Concentric Circles (Simulated with scaling Views) */}
                  <Animated.View style={[
                    styles.radarPulse, 
                    { 
                      borderColor: colors.primary,
                      transform: [{ scale: pulseAnim1 }],
                      opacity: pulseAnim1.interpolate({ inputRange: [1, 2], outputRange: [0.6, 0] })
                    }
                  ]} />
                  <Animated.View style={[
                    styles.radarPulse, 
                    { 
                      borderColor: colors.primary,
                      transform: [{ scale: pulseAnim2 }],
                      opacity: pulseAnim2.interpolate({ inputRange: [1.2, 2.2], outputRange: [0.4, 0] })
                    }
                  ]} />

                  {/* SVG static mesh and targets */}
                  <Svg width="180" height="180" viewBox="0 0 180 180" style={styles.radarSvg}>
                    <Circle cx="90" cy="90" r="80" stroke={colors.primary} strokeWidth="0.8" strokeDasharray="3,3" fill="none" opacity="0.25" />
                    <Circle cx="90" cy="90" r="55" stroke={colors.primary} strokeWidth="0.8" fill="none" opacity="0.4" />
                    <Circle cx="90" cy="90" r="30" stroke={colors.primary} strokeWidth="1" fill="none" opacity="0.6" />
                    <Path d="M 90,0 L 90,180 M 0,90 L 180,90" stroke={colors.primary} strokeWidth="0.5" opacity="0.2" />

                    {/* Simulated target booking points in range */}
                    <Circle cx="45" cy="65" r="5" fill={colors.success} opacity="0.8" />
                    <Circle cx="135" cy="115" r="4" fill={colors.primary} opacity="0.7" />
                    <Circle cx="120" cy="50" r="5" fill={colors.warning} opacity="0.6" />
                  </Svg>

                  {/* Rotating Sweeper Line */}
                  <Animated.View style={[styles.radarSweep, { transform: [{ rotate: spinRotation }] }]}>
                    <View style={[styles.sweepLine, { backgroundColor: colors.primary }]} />
                  </Animated.View>

                  {/* Central Node representing Driver */}
                  <View style={[styles.radarCenterNode, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
                    <MaterialCommunityIcons name="bike" size={13} color="#FFFFFF" />
                  </View>
                </View>

                <Text style={[styles.radarScanText, { color: colors.text }]}>Searching for cargo requests nearby...</Text>
                <Text style={[styles.radarScanSubtext, { color: colors.textSecondary }]}>Keep the app open and stay online to maximize your chance of match</Text>


              </View>
              </View>
            ) : (
              <View style={[styles.offlineWrapperCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.offlineIconContainer, { backgroundColor: colors.accent }]}>
                  <MaterialCommunityIcons name="bike" size={40} color={colors.textMuted} />
                </View>
                <Text style={[styles.offlineText, { color: colors.text, fontWeight: '900' }]}>
                  You are Offline
                </Text>
                <Text style={[styles.offlineSubtext, { color: colors.textSecondary }]}>
                  Go online anytime to receive delivery requests.
                </Text>
                <TouchableOpacity
                  style={[styles.goOnlineBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleToggleOnline(true)}
                >
                  <Text style={styles.goOnlineText}>Go Online Now</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Redesigned Summary Stats Grid */}
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Today's Summary</Text>
            <View style={styles.statsGrid}>
                {stats.map(stat => (
                  <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.statHeaderRow}>
                      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
                      <View style={[styles.statIconBadge, { backgroundColor: `${stat.color}15` }]}>
                        <Ionicons name={stat.iconName as any} size={15} color={stat.color} />
                      </View>
                    </View>
                    <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
                    <View style={[styles.statUnderline, { backgroundColor: stat.color }]} />
                  </View>
                ))}
              </View>

              {/* Today's Tasks Queue Preview Section */}
              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Recent Delivery Queue</Text>
              <View style={[styles.tasksPreviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.tasksPreviewHeader}>
                  <Text style={[styles.tasksPreviewSub, { color: colors.textSecondary }]}>LATEST COMPLETED RUNS</Text>
                  <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigation.navigate('DriverTabs' as any, { screen: 'Tasks' } as any)}>
                    <Text style={[styles.viewAllText, { color: colors.primary }]}>View All Tasks</Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.primary} />
                  </TouchableOpacity>
                </View>

                {historyOrders.filter((o: any) => ['completed', 'delivered', 'done', 'finished', 'closed', 'success'].includes((o.status || '').toLowerCase())).length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>No completed tasks found</Text>
                  </View>
                ) : (
                  historyOrders
                    .filter((o: any) => ['completed', 'delivered', 'done', 'finished', 'closed', 'success'].includes((o.status || '').toLowerCase()))
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                    .slice(0, 3)
                    .map((item: any, idx: number, arr: any[]) => {
                    const isLast = idx === arr.length - 1;
                    
                    let timeText = 'Today';
                    try {
                      if (item.createdAt) {
                        const d = new Date(item.createdAt);
                        timeText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      }
                    } catch (e) {}

                    const pickupShort = formatAddressString(item.pickup || item.pickupAddress, 'Pickup').split(',')[0];
                    const dropShort = formatAddressString(item.drop || item.dropAddress, 'Dropoff').split(',')[0];

                    return (
                      <View key={item.id} style={[styles.previewTaskRow, !isLast && { borderBottomColor: colors.border }]}>
                        <View style={styles.previewTaskLeft}>
                          <View style={[styles.previewTaskIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                            <Ionicons name="checkmark" size={14} color={colors.success} />
                          </View>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={[styles.previewTaskCode, { color: colors.text }]}>
                              {item.bookingId ? (item.bookingId.startsWith('#') ? item.bookingId : `#${item.bookingId}`) : `#ORD-${item.id}`}
                            </Text>
                            <Text style={[styles.previewTaskPath, { color: colors.textSecondary }]} numberOfLines={1}>
                              {pickupShort} ➔ {dropShort}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.previewTaskRight}>
                          <Text style={[styles.previewTaskPrice, { color: colors.success }]}>
                            ₹{typeof item.amount === 'number' ? item.amount.toFixed(2) : (parseFloat(String(item.amount || '0').replace('₹', '')) || 0).toFixed(2)}
                          </Text>
                          <Text style={[styles.previewTaskDate, { color: colors.textMuted }]}>{timeText}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
        

        
        

        
        

      </ScrollView>

      {/* Redesigned Premium Delivery Proof Sheet Modal */}
      

      {/* Prominent Location Disclosure Modal (Google Play Compliance) */}
      <LocationDisclosureModal
        visible={showLocationDisclosure}
        onContinue={handleContinueDisclosure}
        onNotNow={handleNotNowDisclosure}
        onOpenPrivacyPolicy={() => navigation.navigate('PrivacyPolicy' as any)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOnline: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 9,
    right: 11,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  dutyControlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  dutyControlCardOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  dutyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  dutyStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 4,
  },
  dutyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dutySubtext: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 14,
  },
  dutyInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  dutyInfoText: {
    fontSize: 10,
    fontWeight: '600',
  },
  dutyInfoSeparator: {
    fontSize: 10,
    opacity: 0.5,
  },
  stateWrapper: {
    paddingHorizontal: 20,
  },
  performanceCard: {
    flexDirection: 'row',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  performanceLeft: {
    marginRight: 16,
  },
  progressRingWrapper: {
    position: 'relative',
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTextCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPercentText: {
    fontSize: 18,
    fontWeight: '800',
  },
  progressLabelSubText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  performanceRight: {
    flex: 1,
  },
  performanceTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  performanceTargetText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  miniStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 8,
  },
  miniStatItem: {
    alignItems: 'flex-start',
  },
  miniStatValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  miniStatLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  radarWrapperCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  radarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  radarStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseStatusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  radarStatusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  radarLocationLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  radarContainer: {
    position: 'relative',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  radarPulse: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1.5,
  },
  radarSvg: {
    zIndex: 1,
  },
  radarSweep: {
    position: 'absolute',
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  sweepLine: {
    width: 2,
    height: 90,
    marginTop: -90,
    opacity: 0.45,
  },
  radarCenterNode: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  radarScanText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  radarScanSubtext: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  simulateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    gap: 8,
    paddingHorizontal: 24,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  simulateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  offlineWrapperCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  offlineIconContainer: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  offlineText: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  offlineSubtext: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  goOnlineBtn: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOnlineText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    justifyContent: 'space-between',
    height: 94,
    position: 'relative',
    overflow: 'hidden',
  },
  statHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  incomingTicketCard: {
    marginHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  ticketTopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    paddingBottom: 14,
  },
  incomingAlertPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  incomingAlertText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timerCircleBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCircleText: {
    fontSize: 13,
    fontWeight: '800',
  },
  ticketSeparatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
    width: '100%',
    position: 'relative',
  },
  ticketSemicircleLeft: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: -9,
    zIndex: 2,
  },
  ticketSeparatorDots: {
    flex: 1,
    marginHorizontal: 4,
  },
  ticketSemicircleRight: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: -9,
    zIndex: 2,
  },
  ticketContent: {
    padding: 18,
    paddingTop: 4,
  },
  routeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 14,
  },
  timelineDottedContainer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  timelineNodeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineTrackLine: {
    width: 1.5,
    flex: 1,
    marginVertical: 4,
  },
  addressBlock: {
    flex: 1,
  },
  addressSection: {
    justifyContent: 'center',
  },
  addressLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  metaSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 14,
    marginBottom: 18,
  },
  metaSummaryCol: {
    gap: 2,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  incomingBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rejectBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: {
    fontSize: 14,
    fontWeight: '700',
  },
  acceptBtn: {
    flex: 1.8,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  activeOrderCard: {
    marginHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  activeHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  activeHeaderSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  stepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  customerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 14,
    marginBottom: 14,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
  },
  customerPhone: {
    fontSize: 11,
  },
  crmActions: {
    flexDirection: 'row',
    gap: 8,
  },
  crmCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crmNavigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 10,
    gap: 4,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  crmNavigateText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  activeAddressSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
    alignItems: 'center',
  },
  activeLocIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeAddressInfo: {
    flex: 1,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timelineNode: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineNodeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  timelineLine: {
    height: 2.5,
    flex: 1,
    marginHorizontal: -4,
  },
  stepProgressBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  stepProgressText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 11, 25, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  modalGrabIndicator: {
    width: 40,
    height: 4.5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: 4,
  },
  proofOptionCard: {
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 82, 255, 0.08)',
    backgroundColor: 'rgba(0, 82, 255, 0.02)',
    borderRadius: 16,
    padding: 14,
  },
  proofOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  proofLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  proofSubText: {
    fontSize: 11,
    lineHeight: 15,
  },
  otpInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '700',
    marginTop: 6,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  orDividerText: {
    fontSize: 10,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  photoUploadBtn: {
    height: 76,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
  },
  photoBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  completeBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    flexDirection: 'row',
    gap: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  completeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  mapContainer: {
    height: 150,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 12,
  },
  mapRoad: {
    position: 'absolute',
    borderRadius: 3.5,
  },
  mapPin: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -12 }, { translateY: -12 }],
  },
  mapPinOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3.5,
  },
  mapPinText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  mapPinLabelContainer: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  mapPinLabel: {
    fontSize: 8,
    fontWeight: '700',
  },
  bikeTracker: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -13 }, { translateY: -13 }],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  radarWave: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    opacity: 0.45,
  },
  statUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
  tasksPreviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  tasksPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tasksPreviewSub: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  previewTaskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  previewTaskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  previewTaskIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTaskCode: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewTaskPath: {
    fontSize: 11,
    marginTop: 2,
    maxWidth: 180,
  },
  previewTaskRight: {
    alignItems: 'flex-end',
  },
  previewTaskPrice: {
    fontSize: 13,
    fontWeight: '800',
  },
  previewTaskDate: {
    fontSize: 10,
    marginTop: 2,
  },
});

export default DriverDashboardScreen;
