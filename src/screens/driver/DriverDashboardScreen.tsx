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
import { cleanUrl } from '../../utils/urlHelpers';
import { 
  getDriverProfile, 
  getOrderHistory, 
  getActiveOrder, 
  updateOrderStatus, 
  setDriverOnlineStatus,
  registerDeviceToken,
  updateDriverLocation,
  getDriverWallet,
} from '../../services/api';
import { startAlarm, stopAlarm } from '../../services/alarmSound';
import * as Location from 'expo-location';
import LocationDisclosureModal from '../../components/LocationDisclosureModal';
// @ts-ignore
import messaging from '@react-native-firebase/messaging';

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

const DriverDashboardScreen = () => {
  const navigation = useNavigation<NavProp>();
  const { colors, theme } = useTheme();

  // App States
  const [isOnline, setIsOnline] = useState(false);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [driverName, setDriverName] = useState('Partner');
  const [driverEmail, setDriverEmail] = useState('');
  const [activeOrderData, setActiveOrderData] = useState<any>(null);
  const [driverRating, setDriverRating] = useState('5.0');
  const [driverTenure, setDriverTenure] = useState('0m');
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [driverProfilePhoto, setDriverProfilePhoto] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 0. Refresh live wallet balance
      try {
        const walRes = await getDriverWallet();
        const bal = walRes?.wallet?.availableBalance ?? (typeof (walRes as any)?.availableBalance === 'number' ? (walRes as any).availableBalance : 0);
        setWalletBalance(bal);
        if (bal < 10 && isOnline) {
          setIsOnline(false);
          await AsyncStorage.setItem('@driver_is_online', 'false');
          await setDriverOnlineStatus('offline').catch(() => {});
        }
      } catch (wErr) {}

      // 1. Refresh driver profile info
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
      }

      // 2. Refresh orders & earnings stats
      const historyRes = await getOrderHistory();
      if (historyRes && historyRes.orders) {
        setHistoryOrders(historyRes.orders);
        setEarnings(historyRes.totalEarnings);
        setCompletedTrips(historyRes.totalOrders);
      }
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

  // User toggles duty switch
  const handleToggleOnline = async (targetValue: boolean) => {
    if (targetValue) {
      // Step 0: Strict Wallet Balance Verification before going online
      try {
        const walRes = await getDriverWallet().catch(() => null);
        const balance = walRes?.wallet?.availableBalance ?? (typeof (walRes as any)?.availableBalance === 'number' ? (walRes as any).availableBalance : 0);
        setWalletBalance(balance);

        if (balance <= 0) {
          Alert.alert(
            'Wallet Empty',
            'Please recharge your wallet (₹1+) to go online and receive booking requests.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Recharge Wallet', onPress: () => navigation.navigate('Wallet') },
            ]
          );
          setIsOnline(false);
          await AsyncStorage.setItem('@driver_is_online', 'false');
          try {
            await setDriverOnlineStatus('offline');
          } catch (e) {}
          return;
        }
      } catch (e) {
        console.warn('Wallet check error on toggle:', e);
      }

      // Driver wants to go ONLINE: check if foreground location permission is already granted
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        try {
          const statusRes: any = await setDriverOnlineStatus('online');
          if (statusRes && statusRes.success === false && statusRes.error === 'WALLET_EMPTY') {
            Alert.alert(
              'Wallet Empty',
              statusRes.message || 'Please recharge your wallet (₹1+) to go online and receive booking requests.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Recharge Wallet', onPress: () => navigation.navigate('Wallet') },
              ]
            );
            setIsOnline(false);
            await AsyncStorage.setItem('@driver_is_online', 'false');
            return;
          }
        } catch (e) {
          console.warn('Background sync notice for online status:', e);
        }
        setIsOnline(true);
        await AsyncStorage.setItem('@driver_is_online', 'true');
      } else {
        // Permission not yet granted: MUST show Prominent Disclosure Modal BEFORE system permission dialog!
        setShowLocationDisclosure(true);
      }
    } else {
      // Driver wants to go OFFLINE explicitly
      setIsOnline(false);
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
      // Check wallet eligibility before going online
      try {
        const walRes = await getDriverWallet().catch(() => null);
        const balance = walRes?.wallet?.availableBalance ?? (typeof (walRes as any)?.availableBalance === 'number' ? (walRes as any).availableBalance : 0);
        setWalletBalance(balance);

        if (balance <= 0) {
          Alert.alert(
            'Wallet Empty',
            'Please recharge your wallet (₹1+) to go online and receive booking requests.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Recharge Wallet', onPress: () => navigation.navigate('Wallet') },
            ]
          );
          setIsOnline(false);
          await AsyncStorage.setItem('@driver_is_online', 'false');
          try {
            await setDriverOnlineStatus('offline');
          } catch (e) {}
          return;
        }
      } catch (e) {
        console.warn('Wallet check error on continue disclosure:', e);
      }

      // Step 1: Request Foreground Location Permission (Android runtime dialog)
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Location access is required to receive delivery orders and go online.'
        );
        setIsOnline(false);
        return;
      }

      // Step 2: Turn Online and start tracking
      try {
        const statusRes: any = await setDriverOnlineStatus('online');
        if (statusRes && statusRes.success === false && statusRes.error === 'WALLET_EMPTY') {
          Alert.alert(
            'Wallet Empty',
            statusRes.message || 'Please recharge your wallet (₹1+) to go online and receive booking requests.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Recharge Wallet', onPress: () => navigation.navigate('Wallet') },
            ]
          );
          setIsOnline(false);
          await AsyncStorage.setItem('@driver_is_online', 'false');
          return;
        }
      } catch (e) {
        console.warn('Background sync notice for online status:', e);
      }
      setIsOnline(true);
      await AsyncStorage.setItem('@driver_is_online', 'true');
    } catch (e) {
      console.error('Error requesting permissions after disclosure:', e);
      setIsOnline(false);
    }
  };

  // User taps "Not Now" on Prominent Disclosure Modal
  const handleNotNowDisclosure = () => {
    setShowLocationDisclosure(false);
    setIsOnline(false);
    AsyncStorage.setItem('@driver_is_online', 'false').catch(() => {});
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // Restore saved online availability status
        const savedOnlineState = await AsyncStorage.getItem('@driver_is_online');
        if (savedOnlineState === 'true') {
          setIsOnline(true);
        } else if (savedOnlineState === 'false') {
          setIsOnline(false);
        } else {
          // Default to OFFLINE until driver explicitly toggles on
          setIsOnline(false);
          await AsyncStorage.setItem('@driver_is_online', 'false');
        }

        const profileStr = await AsyncStorage.getItem('driverProfile');
        if (profileStr) {
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
        }

        try {
          const driverDb = await getDriverProfile();
          if (driverDb) {
            const kycStatus = String(driverDb.kyc || (driverDb as any).kycStatus || '').toLowerCase();
            if (kycStatus === 'rejected') {
              navigation.reset({ index: 0, routes: [{ name: 'DriverRegistration', params: { mobile: driverDb.phone } }] });
              return;
            } else if (kycStatus !== 'verified' && kycStatus !== 'approved') {
              // Not approved by Admin yet — send back to ApprovalPending waiting room
              navigation.reset({ index: 0, routes: [{ name: 'ApprovalPending' }] });
              return;
            }

            if (typeof driverDb.name === 'string' && driverDb.name.trim().length > 0) {
              setDriverName(driverDb.name.trim().split(' ')[0]);
            }
            if (driverDb.email) setDriverEmail(driverDb.email);
            if (driverDb.rating) setDriverRating(String(driverDb.rating));
            if (driverDb.tenure) setDriverTenure(String(driverDb.tenure));
            // Sync online/offline state from backend, ensuring minimum ₹10 wallet balance is present
            let allowOnline = false;
            try {
              const walRes = await getDriverWallet().catch(() => null);
              const balance = walRes?.wallet?.availableBalance ?? (typeof (walRes as any)?.availableBalance === 'number' ? (walRes as any).availableBalance : 0);
              setWalletBalance(balance);
              allowOnline = (walRes?.wallet?.isEligible !== false) && balance >= 10;
            } catch (wErr) {}

            if (driverDb.status === 'online' && allowOnline) {
              setIsOnline(true);
              await AsyncStorage.setItem('@driver_is_online', 'true');
            } else {
              setIsOnline(false);
              await AsyncStorage.setItem('@driver_is_online', 'false');
              try {
                if (driverDb.status === 'online' && !allowOnline) {
                  await setDriverOnlineStatus('offline');
                }
              } catch (e) {}
            }
            const dbPhoto = cleanUrl(
              driverDb.profilePhotoUri ||
              driverDb.documents?.profilePhotoUrl ||
              (driverDb.documents as any)?.profilePhotoUri ||
              (driverDb as any).profilePhotoUrl ||
              (driverDb as any).profilePhoto
            );
            if (dbPhoto) setDriverProfilePhoto(dbPhoto);
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
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          const token = await messaging().getToken();
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
      unsubscribeTokenRefresh = messaging().onTokenRefresh(async (token: string) => {
        try {
          await registerDeviceToken(token);
        } catch (err) {
          console.warn('Failed to upload refreshed token', err);
        }
      });

      // Handle FCM Push Notifications received while app is in foreground
      unsubscribeOnMessage = messaging().onMessage(async (remoteMessage: any) => {
        console.log('[FCM] Foreground notification received:', remoteMessage);
        const title = remoteMessage.notification?.title || remoteMessage.data?.title || '🚨 NEW ORDER ASSIGNED!';
        const body = remoteMessage.notification?.body || remoteMessage.data?.body || 'You have a new delivery request! Tap to accept.';
        
        startAlarm().catch(() => {});

        Alert.alert(
          title,
          body,
          [
            {
              text: 'ACCEPT ORDER',
              onPress: () => {
                stopAlarm().catch(() => {});
                let orderData: any = null;
                if (remoteMessage.data) {
                  if (remoteMessage.data.order) {
                    try {
                      orderData = typeof remoteMessage.data.order === 'string' 
                        ? JSON.parse(remoteMessage.data.order) 
                        : remoteMessage.data.order;
                    } catch (e) {
                      orderData = remoteMessage.data;
                    }
                  } else {
                    orderData = remoteMessage.data;
                  }
                }
                navigation.navigate('IncomingOrder', { order: orderData });
              }
            }
          ]
        );
      });

      // Handle when driver taps notification from tray
      unsubscribeNotificationOpened = messaging().onNotificationOpenedApp((remoteMessage: any) => {
        console.log('[FCM] Notification opened app from tray:', remoteMessage);
        let orderData: any = null;
        if (remoteMessage.data) {
          if (remoteMessage.data.order) {
            try {
              orderData = typeof remoteMessage.data.order === 'string' 
                ? JSON.parse(remoteMessage.data.order) 
                : remoteMessage.data.order;
            } catch (e) {
              orderData = remoteMessage.data;
            }
          } else {
            orderData = remoteMessage.data;
          }
        }
        navigation.navigate('IncomingOrder', { order: orderData });
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

  // Live location updates while online
  useEffect(() => {
    const startLocationTracking = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          // If permission is not granted, trigger disclosure modal instead of calling request directly
          setShowLocationDisclosure(true);
          setIsOnline(false);
          return;
        }

        // Send current position immediately
        const initialLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (initialLoc?.coords) {
          await updateDriverLocation(
            initialLoc.coords.latitude,
            initialLoc.coords.longitude,
            initialLoc.coords.heading ?? undefined
          );
        }

        // Start watching location changes
        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000, // Every 10 seconds
            distanceInterval: 10, // Every 10 meters
          },
          async (loc) => {
            if (loc?.coords) {
              await updateDriverLocation(
                loc.coords.latitude,
                loc.coords.longitude,
                loc.coords.heading ?? undefined
              );
            }
          }
        );
      } catch (e) {
        console.error('Failed to configure location tracking', e);
      }
    };

    if (isOnline) {
      startLocationTracking();
    } else {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    }

    return () => {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }
    };
  }, [isOnline]);

    const [earnings, setEarnings] = useState(0);
  const [completedTrips, setCompletedTrips] = useState(0);
  
  // Animation values for radar pulses
  const pulseAnim1 = useRef(new Animated.Value(1)).current;
  const pulseAnim2 = useRef(new Animated.Value(1.2)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Timer Ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);

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
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 4000,
            useNativeDriver: true,
          }),
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
          setEarnings(historyRes.totalEarnings);
          setCompletedTrips(historyRes.totalOrders);
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
            if (['accepted', 'picked_up', 'transit', 'arrived', 'in_transit', 'payment_confirmation_pending', 'delivering', 'otp_verified', 'active'].includes(status)) {
              navigation.navigate('ActiveOrder', { order: activeOrder });
              return;
            } else if (['assigned', 'pending', 'searching', 'created'].includes(status)) {
              navigation.navigate('IncomingOrder', { order: activeOrder });
              return;
            }
          }
        } catch (e) {
          // Ignore network errors silently on poll
        }
      };

      checkAndRestoreActiveOrder();
      interval = setInterval(checkAndRestoreActiveOrder, 4000);

      return () => {
        if (interval) clearInterval(interval);
      };
    }, [navigation])
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
                    <Text style={[styles.dutyInfoText, { color: colors.textSecondary }]}>Honda Activa</Text>
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
                  Earn <Text style={{ color: colors.primary, fontWeight: '700' }}>₹{dailyTarget}</Text> today. Keep delivering!
                </Text>
                
                <View style={styles.miniStatsRow}>
                  <View style={styles.miniStatItem}>
                    <Text style={[styles.miniStatValue, { color: colors.text }]}>{completedTrips}/10</Text>
                    <Text style={[styles.miniStatLabel, { color: colors.textMuted }]}>Trips</Text>
                  </View>
                  <View style={styles.miniStatItem}>
                    <Text style={[styles.miniStatValue, { color: colors.text }]}>5.8h</Text>
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
            ) : (
              <View style={[styles.offlineWrapperCard, { backgroundColor: colors.card, borderColor: (walletBalance !== null && walletBalance < 10) ? '#EF4444' : colors.border }]}>
                <View style={[styles.offlineIconContainer, { backgroundColor: (walletBalance !== null && walletBalance < 10) ? 'rgba(239,68,68,0.12)' : colors.accent }]}>
                  <MaterialCommunityIcons name={(walletBalance !== null && walletBalance < 10) ? 'wallet-outline' : 'bike'} size={40} color={(walletBalance !== null && walletBalance < 10) ? '#EF4444' : colors.textMuted} />
                </View>
                <Text style={[styles.offlineText, { color: (walletBalance !== null && walletBalance < 10) ? '#DC2626' : colors.text, fontWeight: '900' }]}>
                  {(walletBalance !== null && walletBalance < 10) 
                    ? (walletBalance <= 0 ? 'WALLET BALANCE EXHAUSTED' : 'WALLET BALANCE INSUFFICIENT')
                    : 'You are Offline'}
                </Text>
                <Text style={[styles.offlineSubtext, { color: colors.textSecondary }]}>
                  {(walletBalance !== null && walletBalance < 10)
                    ? (walletBalance <= 0 
                        ? 'Recharge your operational wallet to continue receiving orders.'
                        : `Minimum ₹10 balance required to go online. Current balance: ₹${walletBalance.toFixed(2)}.`)
                    : 'Toggle the duty switch above to start receiving deliveries and earning fares'}
                </Text>
                {(walletBalance !== null && walletBalance < 10) ? (
                  <TouchableOpacity style={[styles.goOnlineBtn, { backgroundColor: '#DC2626' }]} onPress={() => navigation.navigate('Wallet')}>
                    <Text style={[styles.goOnlineText, { fontWeight: '900', letterSpacing: 0.5 }]}>RECHARGE WALLET</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.goOnlineBtn, { backgroundColor: colors.primary }]} onPress={() => handleToggleOnline(true)}>
                    <Text style={styles.goOnlineText}>Go Online Now</Text>
                  </TouchableOpacity>
                )}
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

                    const pickupShort = (item.pickup && typeof item.pickup === 'string') ? item.pickup.split(',')[0] : ((item.pickupAddress && typeof item.pickupAddress === 'string') ? item.pickupAddress.split(',')[0] : 'Pickup');
                    const dropShort = (item.drop && typeof item.drop === 'string') ? item.drop.split(',')[0] : ((item.dropAddress && typeof item.dropAddress === 'string') ? item.dropAddress.split(',')[0] : 'Dropoff');

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
