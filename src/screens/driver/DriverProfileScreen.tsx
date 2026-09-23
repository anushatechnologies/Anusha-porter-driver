import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import {
  getDriverProfile,
  getOrderHistory,
  getDriverPayoutAccount,
  setDriverOnlineStatus,
  uploadDriverPhoto,
  updateDriverProfile,
  getActiveVehicles,
  VehicleOption,
} from '../../services/api';
import { cleanUrl, formatAddressString } from '../../utils/urlHelpers';
import { getAuth, signOut } from '@react-native-firebase/auth';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const { width } = Dimensions.get('window');

const DriverProfileScreen = () => {
  const navigation = useNavigation<NavProp>();
  const { colors, theme, themeMode, setThemeMode } = useTheme();
  const [profileData, setProfileData] = React.useState<any>(null);
  const [selectedDocImage, setSelectedDocImage] = React.useState<string | null>(null);
  const [imageError, setImageError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  // Edit Profile modal
  const [editModalVisible, setEditModalVisible] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);
  const [availableVehicles, setAvailableVehicles] = React.useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = React.useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    name: '',
    phone: '',
    vehicle: '',
    vehicleType: '',
    vehicleNumber: '',
    address: '',
    city: '',
    pincode: '',
    bankAccountNumber: '',
    bankIfscCode: '',
    bankAccountName: '',
    upiId: '',
  });

  const fetchProfileFreshData = async () => {
    try {
      setImageError(false);
      const data = await AsyncStorage.getItem('driverProfile');
      let localProfile: any = data ? JSON.parse(data) : null;

      // Resilient fallback: If localProfile is missing address or bank details, recover them from registration draft
      if (!localProfile?.addressLine1 || !localProfile?.bankName || !localProfile?.vehicleNumber) {
        try {
          const draftRaw = await AsyncStorage.getItem('driverDraftData');
          if (draftRaw) {
            const draft = JSON.parse(draftRaw);
            localProfile = {
              ...(draft || {}),
              ...(localProfile || {}),
              addressLine1: localProfile?.addressLine1 || localProfile?.address || draft?.addressLine1 || draft?.address || '',
              city: localProfile?.city || draft?.city || '',
              state: localProfile?.state || draft?.state || '',
              pincode: localProfile?.pincode || localProfile?.pin || draft?.pincode || draft?.pin || '',
              bankName: localProfile?.bankName || draft?.bankName || '',
              accountHolderName: localProfile?.accountHolderName || draft?.accountHolderName || '',
              accountNumber: localProfile?.accountNumber || draft?.accountNumber || '',
              ifscCode: localProfile?.ifscCode || draft?.ifscCode || '',
              vehicleNumber: localProfile?.vehicleNumber || draft?.vehicleNumber || '',
              rcNumber: localProfile?.rcNumber || draft?.rcNumber || '',
              aadhaarNumber: localProfile?.aadhaarNumber || draft?.aadhaarNumber || '',
              panNumber: localProfile?.panNumber || draft?.panNumber || '',
              licenseNumber: localProfile?.licenseNumber || draft?.licenseNumber || '',
              dob: localProfile?.dob || draft?.dob || '',
              gender: localProfile?.gender || draft?.gender || '',
            };
          }
        } catch { }
      }

      if (localProfile) {
        if (localProfile.fullName === 'Test Driver') localProfile.fullName = '';
        if (localProfile.email === 'testdriver@example.com') localProfile.email = '';
        if (localProfile.vehicleNumber === 'TG01AB1234') localProfile.vehicleNumber = '';
        setProfileData(localProfile);
      }

      const driverDb = await getDriverProfile();
      if (driverDb) {
        setImageError(false);
        const extractPhoto = (db: any, loc: any): string => {
          const candidates = [
            db?.profilePhotoUri, db?.profile_photo_uri, db?.profilePhotoUrl, db?.profile_photo_url, db?.profilePhoto, db?.profile_photo,
            db?.photo, db?.photoUrl, db?.photoUri, db?.avatar, db?.avatarUrl, db?.selfieUrl, db?.selfieUri,
            db?.image, db?.imageUrl,
            db?.documents?.profilePhotoUrl, db?.documents?.profile_photo_url, db?.documents?.profilePhotoUri,
            db?.documents?.profilePhoto, loc?.profilePhotoUri, loc?.profilePhotoUrl, loc?.profilePhoto, loc?.photo, loc?.avatar,
          ];
          for (const c of candidates) {
            if (c && typeof c === 'string' && c.trim().length > 0) return cleanUrl(c);
          }
          return '';
        };

        // Fetch masked payout account info from live backend endpoint GET /api/drivers/me/payout-account
        let payoutAccount: any = null;
        try {
          const accRes = await getDriverPayoutAccount();
          if (accRes && accRes.account) payoutAccount = accRes.account;
        } catch (accErr) {
          // Payout account endpoint might not be active, fallback to driver profile details
        }

        const resolvedPhoto = extractPhoto(driverDb, localProfile);

        const cleanDbName = (driverDb.name || '').replace(/Test Driver/gi, '').trim();
        const cleanDbEmail = (driverDb.email || '').replace(/testdriver@example\.com/gi, '').trim();
        const cleanDbVeh = (driverDb.vehicleNumber || '').replace(/TG01AB1234/gi, '').trim();

        const merged = {
          ...(localProfile || {}),
          fullName: cleanDbName || localProfile?.fullName || localProfile?.name || 'Driver Partner',
          mobile: driverDb.phone || (driverDb as any).mobile || localProfile?.mobile || localProfile?.phone || '',
          phone: driverDb.phone || (driverDb as any).mobile || localProfile?.phone || localProfile?.mobile || '',
          email: cleanDbEmail || driverDb.email || localProfile?.email || '',
          dob: driverDb.dob || (driverDb as any).dateOfBirth || (driverDb as any).date_of_birth || localProfile?.dob || '',
          gender: driverDb.gender || localProfile?.gender || '',
          serviceType: driverDb.serviceType || driverDb.service_type || driverDb.serviceTrack || localProfile?.serviceType || localProfile?.serviceTrack || (
            String(driverDb.vehicleType || localProfile?.vehicleType || '').toLowerCase().includes('cab') ||
              String(driverDb.vehicleType || localProfile?.vehicleType || '').toLowerCase().includes('taxi') ? 'PASSENGER' : 'OUR_SERVICES'
          ),
          serviceTrack: driverDb.serviceTrack || driverDb.serviceType || localProfile?.serviceTrack || localProfile?.serviceType || (
            String(driverDb.vehicleType || localProfile?.vehicleType || '').toLowerCase().includes('cab') ||
              String(driverDb.vehicleType || localProfile?.vehicleType || '').toLowerCase().includes('taxi') ? 'PASSENGER' : 'OUR_SERVICES'
          ),
          vehicleType: driverDb.vehicleType || (driverDb as any).vehicle_type || (driverDb as any).vehicle || localProfile?.vehicleType || localProfile?.vehicle || 'Vehicle',
          vehicleNumber: cleanDbVeh || driverDb.vehicleNumber || (driverDb as any).vehicle_number || (driverDb as any).vehicleNo || localProfile?.vehicleNumber || '',
          rcNumber: driverDb.rcNumber || (driverDb as any).rc_number || localProfile?.rcNumber || '',
          aadhaarNumber: driverDb.aadhaarNumber || (driverDb as any).aadhaar_number || (driverDb as any).aadhaar || localProfile?.aadhaarNumber || '',
          panNumber: driverDb.panNumber || (driverDb as any).pan_number || (driverDb as any).pan || localProfile?.panNumber || '',
          licenseNumber: driverDb.licenseNumber || (driverDb as any).license_number || (driverDb as any).drivingLicense || localProfile?.licenseNumber || '',
          accountHolderName: payoutAccount?.accountHolderName || driverDb.accountHolderName || (driverDb as any).bankAccountName || (driverDb as any).account_holder_name || localProfile?.accountHolderName || '',
          bankName: payoutAccount?.bankName || driverDb.bankName || (driverDb as any).bank_name || (driverDb as any).bankDetails?.bankName || localProfile?.bankName || localProfile?.bank_name || '',
          accountNumber: payoutAccount?.accountNumberMasked || (driverDb.accountNumber ? (driverDb.accountNumber.startsWith('XXXX') ? driverDb.accountNumber : `XXXX XXXX ${driverDb.accountNumber.slice(-4)}`) : (localProfile?.accountNumber ? (localProfile.accountNumber.startsWith('XXXX') ? localProfile.accountNumber : `XXXX XXXX ${localProfile.accountNumber.slice(-4)}`) : '')),
          rawAccountNumber: payoutAccount?.accountNumber || (driverDb as any).bankAccountNumber || driverDb.accountNumber || (driverDb as any).account_number || localProfile?.bankAccountNumber || localProfile?.accountNumber || '',
          bankAccountNumber: payoutAccount?.accountNumber || (driverDb as any).bankAccountNumber || driverDb.accountNumber || (driverDb as any).account_number || localProfile?.bankAccountNumber || localProfile?.accountNumber || '',
          ifscCode: payoutAccount?.ifscCode || (driverDb as any).bankIfscCode || driverDb.ifscCode || (driverDb as any).ifsc_code || (driverDb as any).bankDetails?.ifscCode || localProfile?.ifscCode || '',
          upiId: payoutAccount?.upiId || (driverDb as any).upiId || localProfile?.upiId || '',
          partnerId: driverDb.id ? 'PRT-' + driverDb.id : (localProfile?.partnerId || (localProfile?.mobile ? 'PRT-' + localProfile.mobile.slice(-4) : 'PRT-PENDING')),
          rating: String(driverDb.rating || localProfile?.rating || '5.0'),
          tenure: String(driverDb.tenure || localProfile?.tenure || '0m'),
          kyc: (driverDb.kyc || driverDb.kycStatus || localProfile?.kyc || 'pending'),
          addressLine1: driverDb.addressLine1 || (driverDb as any).address || localProfile?.addressLine1 || localProfile?.address || '',
          city: driverDb.city || localProfile?.city || '',
          state: driverDb.state || localProfile?.state || '',
          pincode: driverDb.pincode || (driverDb as any).pin || localProfile?.pincode || localProfile?.pin || '',
          panUri: cleanUrl(driverDb.panUri || driverDb.panUrl || driverDb.documents?.panUrl || (driverDb.documents as any)?.panUri || localProfile?.panUri || ''),
          profilePhotoUri: resolvedPhoto || localProfile?.profilePhotoUri,
          aadhaarUri: cleanUrl(driverDb.aadhaarUri || driverDb.documents?.aadhaarUrl || localProfile?.aadhaarUri || ''),
          licenseUri: cleanUrl(driverDb.licenseUri || driverDb.documents?.licenseUrl || localProfile?.licenseUri || ''),
          rcUri: cleanUrl(driverDb.rcUri || driverDb.documents?.rcUrl || localProfile?.rcUri || ''),
          bankPassbookUri: cleanUrl(driverDb.bankPassbookUri || driverDb.documents?.bankPassbookUrl || localProfile?.bankPassbookUri || ''),
          documents: {
            aadhaarUrl: cleanUrl(driverDb.documents?.aadhaarUrl || localProfile?.documents?.aadhaarUrl || localProfile?.aadhaarUri || ''),
            panUrl: cleanUrl(driverDb.documents?.panUrl || (driverDb.documents as any)?.panUri || driverDb.panUrl || driverDb.panUri || localProfile?.documents?.panUrl || localProfile?.panUri || ''),
            licenseUrl: cleanUrl(driverDb.documents?.licenseUrl || localProfile?.documents?.licenseUrl || localProfile?.licenseUri || ''),
            rcUrl: cleanUrl(driverDb.documents?.rcUrl || localProfile?.documents?.rcUrl || localProfile?.rcUri || ''),
            bankPassbookUrl: cleanUrl(driverDb.documents?.bankPassbookUrl || localProfile?.documents?.bankPassbookUrl || localProfile?.bankPassbookUri || ''),
          }
        };

        // Fetch actual completed trips count & calculate real-time rating from order history
        try {
          const historyRes = await getOrderHistory();
          const orders = historyRes?.orders || [];
          const completedOrders = orders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');
          merged.trips = completedOrders.length;

          let totalRatingSum = 0;
          let ratedCount = 0;
          completedOrders.forEach((o: any) => {
            const r = parseFloat(String(o.rating || o.customerRating || o.stars || o.ratingScore || 0));
            if (r > 0 && r <= 5) {
              totalRatingSum += r;
              ratedCount++;
            }
          });

          if (ratedCount > 0) {
            const avg = totalRatingSum / ratedCount;
            merged.rating = avg.toFixed(1);
          } else if (completedOrders.length > 0) {
            merged.rating = '5.0';
          }
        } catch { }

        setProfileData(merged);
        await AsyncStorage.setItem('driverProfile', JSON.stringify(merged));
      }
    } catch (e) {
      console.warn('Failed to fetch profile fresh data:', e);
      throw e;
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchProfileFreshData();
    } catch (err) {
      if (Platform.OS === 'web') {
        (window as any).alert('Unable to refresh. Please check your internet connection and try again.');
      } else {
        Alert.alert('Refresh Failed', 'Unable to refresh profile. Please check your internet connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      const loadProfile = async () => {
        try {
          await fetchProfileFreshData();
        } catch (e) {
          console.warn('Failed to load profile on focus:', e);
        }
      };
      loadProfile();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const fullName = profileData?.fullName || '';
  const partnerId = profileData?.partnerId || 'PRT-00000';
  const vehicleMake = profileData?.vehicleType || 'Vehicle';
  const vehiclePlate = profileData?.vehicleNumber || '';

  const vehicleIconName = (() => {
    const v = (vehicleMake || '').toLowerCase();
    if (v.includes('cab') || v.includes('car') || v.includes('taxi')) return 'car';
    if (v.includes('auto') || v.includes('3 wheeler') || v.includes('three')) return 'rickshaw';
    if (v.includes('truck') || v.includes('ace') || v.includes('bolero') || v.includes('pickup')) return 'truck';
    return 'bike';
  })();

  const serviceCapability = (() => {
    const raw = String(
      profileData?.serviceType ||
      (profileData as any)?.service_type ||
      profileData?.serviceCategory ||
      (profileData as any)?.service_category ||
      ''
    ).toUpperCase();

    // 1. Explicit Passenger signals
    if (raw === 'PASSENGER' || raw === 'CAB' || raw === 'RIDE' || raw.includes('PASSENGER')) {
      return { label: 'Passenger Rides', icon: 'account-group', color: '#10B981' };
    }

    // 2. Explicit Goods / Logistics / Our Services signals
    if (
      raw === 'GOODS' ||
      raw === 'OUR_SERVICES' ||
      raw.includes('GOODS') ||
      raw.includes('OUR_SERVICES') ||
      raw.includes('LOGISTICS') ||
      raw.includes('COURIER') ||
      raw.includes('CARGO')
    ) {
      return { label: 'Goods & Logistics Delivery', icon: 'truck-delivery', color: '#3B82F6' };
    }

    // 3. Vehicle-based heuristic
    const v = (vehicleMake || '').toLowerCase();
    if (v.includes('cab') || v.includes('taxi') || v.includes('sedan') || v.includes('suv') || v.includes('bike taxi')) {
      return { label: 'Passenger Rides', icon: 'account-group', color: '#10B981' };
    }

    // Default: Goods & Logistics Delivery (for 3 wheeler, Tata Ace, Pickup, Trucks, etc.)
    return { label: 'Goods & Logistics Delivery', icon: 'truck-delivery', color: '#3B82F6' };
  })();

  const handleToggleTheme = () => {
    if (themeMode === 'light') {
      setThemeMode('dark');
    } else if (themeMode === 'dark') {
      setThemeMode('system');
    } else {
      setThemeMode('light');
    }
  };

  const handleEditPhoto = () => {
    Alert.alert(
      'Update Profile Photo',
      'Choose an option to update your photo',
      [
        {
          text: '📷 Open Camera',
          onPress: async () => {
            try {
              if (Platform.OS !== 'web') {
                const { status: existingStatus } = await ImagePicker.getCameraPermissionsAsync();
                let finalStatus = existingStatus;
                if (existingStatus !== 'granted') {
                  const { status } = await ImagePicker.requestCameraPermissionsAsync();
                  finalStatus = status;
                }
                if (finalStatus !== 'granted') {
                  Alert.alert('Permission Required', 'Camera permission is required.');
                  return;
                }
              }
              setTimeout(async () => {
                try {
                  const result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ['images'],
                    allowsEditing: false,
                    quality: 0.7,
                  });
                  if (!result.canceled && result.assets && result.assets.length > 0) {
                    const localUri = result.assets[0].uri;
                    setImageError(false);
                    setProfileData((prev: any) => ({ ...prev, profilePhotoUri: localUri }));
                    const driverId = profileData?.id || profileData?.partnerId || profileData?.mobile;
                    const res = await uploadDriverPhoto(localUri, driverId);
                    if (res?.url) {
                      setProfileData((prev: any) => ({ ...prev, profilePhotoUri: res.url }));
                      Alert.alert('Success', 'Profile photo updated successfully!');
                    }
                  }
                } catch (camErr) {
                  console.warn('Camera launch error, fallback to gallery:', camErr);
                }
              }, 350);
            } catch (e: any) {
              console.warn('Camera photo error:', e);
            }
          },
        },
        {
          text: '📁 Choose from Gallery',
          onPress: async () => {
            try {
              if (Platform.OS !== 'web') {
                const { status: existingStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
                let finalStatus = existingStatus;
                if (existingStatus !== 'granted') {
                  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                  finalStatus = status;
                }
                if (finalStatus !== 'granted') {
                  Alert.alert('Permission Required', 'Gallery permission is required.');
                  return;
                }
              }
              setTimeout(async () => {
                try {
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsEditing: false,
                    quality: 0.7,
                  });
                  if (!result.canceled && result.assets && result.assets.length > 0) {
                    const localUri = result.assets[0].uri;
                    setImageError(false);
                    setProfileData((prev: any) => ({ ...prev, profilePhotoUri: localUri }));
                    const driverId = profileData?.id || profileData?.partnerId || profileData?.mobile;
                    const res = await uploadDriverPhoto(localUri, driverId);
                    if (res?.url) {
                      setProfileData((prev: any) => ({ ...prev, profilePhotoUri: res.url }));
                      Alert.alert('Success', 'Profile photo updated successfully!');
                    }
                  }
                } catch (galErr) {
                  console.warn('Gallery pick error:', galErr);
                }
              }, 350);
            } catch (e: any) {
              console.warn('Gallery photo error:', e);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const loadVehicles = async () => {
    setLoadingVehicles(true);
    try {
      // 1. Check all possible profile serviceType fields
      const rawSType = profileData?.serviceType || (profileData as any)?.service_type || (profileData as any)?.serviceTrack || profileData?.serviceCategory;

      // 2. Check saved registration & permanent track from storage
      const savedDraftTrack = await AsyncStorage.getItem('driverDraftServiceTrack').catch(() => null);
      const savedPermanentTrack = await AsyncStorage.getItem('driverServiceTrack').catch(() => null);

      // 3. Check current vehicle name / vehicle type heuristic
      const currentVeh = String(profileData?.vehicleType || editForm?.vehicleType || editForm?.vehicle || '').toLowerCase();
      const isVehPassenger =
        currentVeh.includes('cab') || currentVeh.includes('car') || currentVeh.includes('taxi') ||
        currentVeh.includes('sedan') || currentVeh.includes('suv') || currentVeh.includes('bike taxi') ||
        currentVeh.includes('auto taxi');
      const isVehGoods =
        currentVeh.includes('truck') || currentVeh.includes('ace') || currentVeh.includes('pickup') ||
        currentVeh.includes('lorry') || currentVeh.includes('407') || currentVeh.includes('1109') ||
        currentVeh.includes('mini truck');

      // Determine track strictly
      let sType: 'PASSENGER' | 'OUR_SERVICES' = 'OUR_SERVICES';
      if (
        String(rawSType || '').toUpperCase().includes('PASS') ||
        savedDraftTrack === 'PASSENGER' ||
        savedPermanentTrack === 'PASSENGER' ||
        (isVehPassenger && !isVehGoods)
      ) {
        sType = 'PASSENGER';
      } else {
        sType = 'OUR_SERVICES';
      }

      const res = await getActiveVehicles(sType);
      const goodsDefaults: VehicleOption[] = [
        { id: '2_wheeler', name: '2 Wheeler (Bike/Scooter)', type: '2_wheeler', capacity: 'Up to 20 kg', iconName: 'motorbike', serviceType: 'OUR_SERVICES' },
        { id: '3_wheeler', name: '3 Wheeler (Auto/Champion)', type: '3_wheeler', capacity: 'Up to 500 kg', iconName: 'truck-cargo-container', serviceType: 'OUR_SERVICES' },
        { id: 'tata_ace', name: 'Tata Ace / Chota Hathi', type: 'tata_ace', capacity: 'Up to 750 kg', iconName: 'truck-delivery', serviceType: 'OUR_SERVICES' },
        { id: 'pickup_8ft', name: 'Pickup 8ft / Dost', type: 'pickup_8ft', capacity: 'Up to 1.2 Ton', iconName: 'truck-flatbed', serviceType: 'OUR_SERVICES' },
        { id: 'tata_407', name: 'Tata 407 (10ft)', type: 'tata_407', capacity: 'Up to 2.5 Ton', iconName: 'truck', serviceType: 'OUR_SERVICES' },
        { id: 'canter_14ft', name: 'Canter / Eicher 14ft', type: 'canter_14ft', capacity: 'Up to 3.5 Ton', iconName: 'truck-trailer', serviceType: 'OUR_SERVICES' },
      ];
      const passengerDefaults: VehicleOption[] = [
        { id: 'bike_taxi', name: 'Bike Taxi', type: 'bike_taxi', capacity: '1 Person', iconName: 'motorbike', serviceType: 'PASSENGER' },
        { id: 'auto_taxi', name: 'Auto Taxi', type: 'auto_taxi', capacity: '3 Persons', iconName: 'rickshaw', serviceType: 'PASSENGER' },
        { id: 'cab_mini', name: 'Cab Mini / Economy', type: 'cab_mini', capacity: '4 Persons', iconName: 'car-side', serviceType: 'PASSENGER' },
        { id: 'cab_sedan', name: 'Cab Sedan', type: 'cab_sedan', capacity: '4 Persons', iconName: 'car', serviceType: 'PASSENGER' },
        { id: 'cab_suv', name: 'Cab SUV / XL', type: 'cab_suv', capacity: '6-7 Persons', iconName: 'car-estate', serviceType: 'PASSENGER' },
      ];

      if (res && Array.isArray(res.vehicles) && res.vehicles.length > 0) {
        // Enforce strict category filter so Goods drivers only see Goods vehicles and Passenger drivers only see Passenger vehicles
        const strictlyFiltered = res.vehicles.filter(v => {
          const vSvc = String(v.serviceType || '').toUpperCase();
          const vName = (v.name + ' ' + v.type).toLowerCase();
          const isPassengerVeh =
            vSvc === 'PASSENGER' || vSvc === 'CAB' || vSvc === 'TAXI' || vSvc === 'RIDE' ||
            vName.includes('cab') || vName.includes('taxi') || vName.includes('sedan') ||
            vName.includes('suv') || vName.includes('bike taxi') || vName.includes('auto taxi');

          if (sType === 'PASSENGER') {
            return isPassengerVeh;
          } else {
            return !isPassengerVeh;
          }
        });

        if (strictlyFiltered.length > 0) {
          setAvailableVehicles(strictlyFiltered);
        } else {
          setAvailableVehicles(sType === 'PASSENGER' ? passengerDefaults : goodsDefaults);
        }
      } else {
        setAvailableVehicles(sType === 'PASSENGER' ? passengerDefaults : goodsDefaults);
      }
    } catch (e) {
      console.warn('[DriverProfileScreen] Failed to fetch admin vehicles:', e);
      const isPassenger = String(profileData?.serviceType || '').toUpperCase().includes('PASS');
      setAvailableVehicles(isPassenger ? [
        { id: 'bike_taxi', name: 'Bike Taxi', type: 'bike_taxi', capacity: '1 Person', iconName: 'motorbike', serviceType: 'PASSENGER' },
        { id: 'auto_taxi', name: 'Auto Taxi', type: 'auto_taxi', capacity: '3 Persons', iconName: 'rickshaw', serviceType: 'PASSENGER' },
        { id: 'cab_mini', name: 'Cab Mini / Economy', type: 'cab_mini', capacity: '4 Persons', iconName: 'car-side', serviceType: 'PASSENGER' },
        { id: 'cab_sedan', name: 'Cab Sedan', type: 'cab_sedan', capacity: '4 Persons', iconName: 'car', serviceType: 'PASSENGER' },
        { id: 'cab_suv', name: 'Cab SUV / XL', type: 'cab_suv', capacity: '6-7 Persons', iconName: 'car-estate', serviceType: 'PASSENGER' },
      ] : [
        { id: '2_wheeler', name: '2 Wheeler (Bike/Scooter)', type: '2_wheeler', capacity: 'Up to 20 kg', iconName: 'motorbike', serviceType: 'OUR_SERVICES' },
        { id: '3_wheeler', name: '3 Wheeler (Auto/Champion)', type: '3_wheeler', capacity: 'Up to 500 kg', iconName: 'truck-cargo-container', serviceType: 'OUR_SERVICES' },
        { id: 'tata_ace', name: 'Tata Ace / Chota Hathi', type: 'tata_ace', capacity: 'Up to 750 kg', iconName: 'truck-delivery', serviceType: 'OUR_SERVICES' },
        { id: 'pickup_8ft', name: 'Pickup 8ft / Dost', type: 'pickup_8ft', capacity: 'Up to 1.2 Ton', iconName: 'truck-flatbed', serviceType: 'OUR_SERVICES' },
        { id: 'tata_407', name: 'Tata 407 (10ft)', type: 'tata_407', capacity: 'Up to 2.5 Ton', iconName: 'truck', serviceType: 'OUR_SERVICES' },
        { id: 'canter_14ft', name: 'Canter / Eicher 14ft', type: 'canter_14ft', capacity: 'Up to 3.5 Ton', iconName: 'truck-trailer', serviceType: 'OUR_SERVICES' },
      ]);
    } finally {
      setLoadingVehicles(false);
    }
  };

  const openEditModal = () => {
    setEditForm({
      name: profileData?.fullName || profileData?.name || '',
      phone: profileData?.mobile || profileData?.phone || '',
      vehicle: profileData?.vehicleType || '',
      vehicleType: profileData?.vehicleType || '',
      vehicleNumber: profileData?.vehicleNumber || '',
      address: profileData?.addressLine1 || '',
      city: profileData?.city || '',
      pincode: profileData?.pincode || '',
      bankAccountNumber: profileData?.rawAccountNumber || profileData?.bankAccountNumber || (profileData?.accountNumber && !profileData.accountNumber.includes('X') ? profileData.accountNumber : ''),
      bankIfscCode: profileData?.bankIfscCode || profileData?.ifscCode || '',
      bankAccountName: profileData?.bankAccountName || profileData?.accountHolderName || '',
      upiId: profileData?.upiId || '',
    });
    setEditModalVisible(true);
    loadVehicles();
  };

  const handleSaveProfile = async () => {
    if (editSaving) return;
    setEditSaving(true);
    try {
      // Preserve and synchronize driver's service track to prevent backend database erasure
      const effectiveServiceType: string =
        profileData?.serviceType ||
        (profileData as any)?.service_type ||
        (profileData as any)?.serviceTrack ||
        (
          String(editForm.vehicle || profileData?.vehicleType || '').toLowerCase().includes('cab') ||
            String(editForm.vehicle || profileData?.vehicleType || '').toLowerCase().includes('taxi')
            ? 'PASSENGER'
            : 'OUR_SERVICES'
        );

      const payload: any = {
        serviceType: effectiveServiceType,
        service_type: effectiveServiceType,
        serviceTrack: effectiveServiceType,
        serviceCategory: effectiveServiceType,
      };
      if (editForm.name.trim()) payload.name = editForm.name.trim();
      // NOTE: phone is intentionally excluded — it is the login identity and cannot be changed via profile edit
      if (editForm.vehicle.trim()) { payload.vehicle = editForm.vehicle.trim(); payload.vehicleType = editForm.vehicle.trim(); }
      if (editForm.vehicleNumber.trim()) payload.vehicleNumber = editForm.vehicleNumber.trim().toUpperCase();
      if (editForm.address.trim()) payload.address = editForm.address.trim();
      if (editForm.city.trim()) payload.city = editForm.city.trim();
      if (editForm.pincode.trim()) payload.pincode = editForm.pincode.trim();
      if (editForm.bankAccountNumber.trim()) payload.bankAccountNumber = editForm.bankAccountNumber.trim();
      if (editForm.bankIfscCode.trim()) payload.bankIfscCode = editForm.bankIfscCode.trim().toUpperCase();
      if (editForm.bankAccountName.trim()) payload.bankAccountName = editForm.bankAccountName.trim();
      if (editForm.upiId.trim()) payload.upiId = editForm.upiId.trim();

      const res = await updateDriverProfile(payload);
      if (res.success) {
        // Persist track to local AsyncStorage
        await AsyncStorage.setItem('driverServiceTrack', effectiveServiceType).catch(() => { });
        // Merge updates into local profile state
        setProfileData((prev: any) => ({
          ...prev,
          fullName: editForm.name || prev?.fullName,
          vehicleType: editForm.vehicle || prev?.vehicleType,
          vehicleNumber: editForm.vehicleNumber || prev?.vehicleNumber,
          addressLine1: editForm.address || prev?.addressLine1,
          city: editForm.city || prev?.city,
          pincode: editForm.pincode || prev?.pincode,
          accountNumber: editForm.bankAccountNumber || prev?.accountNumber,
          ifscCode: editForm.bankIfscCode || prev?.ifscCode,
          accountHolderName: editForm.bankAccountName || prev?.accountHolderName,
          upiId: editForm.upiId || prev?.upiId,
          serviceType: effectiveServiceType,
          service_type: effectiveServiceType,
          serviceTrack: effectiveServiceType,
        }));
        setEditModalVisible(false);
        Alert.alert('Profile Updated', res.message || 'Your profile has been updated successfully.');
      } else {
        Alert.alert('Update Failed', res.message || 'Could not update profile. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'An error occurred while saving.');
    } finally {
      setEditSaving(false);
    }
  };

  const isDark = theme === 'dark';
  const themeIcon = themeMode === 'light' ? 'sunny' : themeMode === 'dark' ? 'moon' : 'phone-portrait';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

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

        {/* Curved Header Section */}
        <View style={styles.headerSection}>
          <Svg height={200} width={width} style={StyleSheet.absoluteFillObject}>
            <Defs>
              <LinearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#0D5CFF" stopOpacity="1" />
                <Stop offset="1" stopColor="#00C896" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Path
              d={`M0 0 L${width} 0 L${width} 140 Q${width / 2} 220 0 140 Z`}
              fill="url(#waveGrad)"
            />
          </Svg>

          <View style={styles.topNav}>
            <Text style={styles.navTitle}>Profile</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={styles.themeToggleBtn} onPress={openEditModal}>
                <Ionicons name="create-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.themeToggleBtn} onPress={handleToggleTheme}>
                <Ionicons name={themeIcon as any} size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Floating Avatar & Details */}
        <View style={styles.identitySection}>
          <TouchableOpacity activeOpacity={0.8} onPress={handleEditPhoto} style={[styles.avatarWrapper, { backgroundColor: colors.background }]}>
            <View style={[styles.avatarContainer, { backgroundColor: isDark ? '#1E293B' : '#CBD5E1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
              {profileData?.profilePhotoUri && !imageError ? (
                <Image
                  source={{ uri: cleanUrl(profileData.profilePhotoUri) }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                  onError={() => setImageError(true)}
                />
              ) : (
                <Ionicons name="person" size={52} color={colors.primary} />
              )}
            </View>
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' }}>
              <Ionicons name="camera" size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={[styles.driverName, { color: colors.text }]}>{fullName}</Text>
          <Text style={[styles.partnerId, { color: colors.textSecondary }]}>Partner ID: {partnerId}</Text>

          <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && styles.softShadow]}>
            <View style={styles.statCol}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {profileData?.rating ? (String(profileData.rating).includes('.') ? String(profileData.rating) : `${profileData.rating}.0`) : '—'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statCol}>
              <Text style={[styles.statValue, { color: colors.text }]}>{profileData?.trips !== undefined ? profileData.trips : 0}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Trips</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statCol}>
              <Text style={[styles.statValue, { color: colors.text }]}>{profileData?.tenure || '0m'}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tenure</Text>
            </View>
          </View>
        </View>

        {/* Content Sections */}
        <View style={styles.contentBody}>

          {/* Personal Information */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Personal Details</Text>
            <TouchableOpacity
              onPress={openEditModal}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: `${colors.primary}18`,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                gap: 5,
                borderWidth: 1,
                borderColor: `${colors.primary}40`,
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={15} color={colors.primary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && styles.softShadow]}>
            <View style={styles.detailItemRow}>
              <Ionicons name="call-outline" size={18} color="#0D5CFF" />
              <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Mobile Number:</Text>
              <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.mobile || 'N/A'}</Text>
            </View>
            <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailItemRow}>
              <Ionicons name="mail-outline" size={18} color="#0D5CFF" />
              <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Email Address:</Text>
              <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.email || 'N/A'}</Text>
            </View>
            {!!profileData?.dob && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="calendar-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Date of Birth:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.dob}</Text>
                </View>
              </>
            )}
            {!!profileData?.gender && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="person-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Gender:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.gender}</Text>
                </View>
              </>
            )}
          </View>

          {/* Address Information */}
          {(profileData?.addressLine1 || profileData?.address || profileData?.city || profileData?.state || profileData?.pincode) ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Address Details</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && styles.softShadow]}>
                <View style={styles.detailItemRow}>
                  <Ionicons name="location-outline" size={18} color="#10B981" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Address:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{formatAddressString(profileData?.addressLine1 || profileData?.address, 'N/A')}</Text>
                </View>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="map-outline" size={18} color="#10B981" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>City / State:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>
                    {[profileData?.city, profileData?.state, profileData?.pincode || profileData?.pin].filter(Boolean).join(', ') || 'N/A'}
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {/* Vehicle & Credentials */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Vehicle & Credentials</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && styles.softShadow]}>
            <View style={styles.vehicleRow}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(13,92,255,0.1)' }]}>
                <MaterialCommunityIcons name={vehicleIconName as any} size={24} color="#0D5CFF" />
              </View>
              <View style={styles.vehicleTextCol}>
                <Text style={[styles.vehicleMake, { color: colors.textSecondary }]}>{vehicleMake}</Text>
                <Text style={[styles.vehiclePlate, { color: colors.text }]}>{vehiclePlate || profileData?.vehicleNumber || 'N/A'}</Text>
              </View>
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>ACTIVE</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 8, gap: 6 }}>
              <MaterialCommunityIcons name={serviceCapability.icon as any} size={14} color={serviceCapability.color} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: serviceCapability.color }}>
                {serviceCapability.label}
              </Text>
            </View>
            {!!(profileData?.rcNumber || profileData?.rc_number) && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="document-text-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>RC Number:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.rcNumber || profileData.rc_number}</Text>
                </View>
              </>
            )}
            {!!(profileData?.licenseNumber || profileData?.license_number) && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="card-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>License No:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.licenseNumber || profileData.license_number}</Text>
                </View>
              </>
            )}
            {!!(profileData?.aadhaarNumber || profileData?.aadhaar_number) && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="finger-print-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Aadhaar No:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.aadhaarNumber || profileData.aadhaar_number}</Text>
                </View>
              </>
            )}
            {!!(profileData?.panNumber || profileData?.pan_number) && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="document-text-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>PAN Number:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.panNumber || profileData.pan_number}</Text>
                </View>
              </>
            )}
          </View>

          {/* Bank Account Details */}
          {(profileData?.bankName || profileData?.bank_name || profileData?.accountNumber || profileData?.account_number || profileData?.ifscCode || profileData?.ifsc_code) ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Bank Account Details</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && styles.softShadow]}>
                <View style={styles.detailItemRow}>
                  <Ionicons name="business-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Bank Name:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.bankName || profileData?.bank_name || 'N/A'}</Text>
                </View>
                {!!(profileData?.accountHolderName || profileData?.account_holder_name) && (
                  <>
                    <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.detailItemRow}>
                      <Ionicons name="person-circle-outline" size={18} color="#F59E0B" />
                      <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Holder Name:</Text>
                      <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.accountHolderName || profileData.account_holder_name}</Text>
                    </View>
                  </>
                )}
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="wallet-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Account No:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.accountNumber || profileData?.account_number || profileData?.bankAccountNumber || 'N/A'}</Text>
                </View>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="barcode-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>IFSC Code:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.ifscCode || profileData?.ifsc_code || profileData?.bankIfscCode || 'N/A'}</Text>
                </View>
              </View>
            </>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings & Support</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }, !isDark && styles.softShadow]}>


            <TouchableOpacity style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]} onPress={() => navigation.navigate('OrderHistory' as any)}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: 'rgba(13,92,255,0.1)' }]}>
                  <Ionicons name="receipt" size={18} color="#0D5CFF" />
                </View>
                <View>
                  <Text style={[styles.menuText, { color: colors.text }]}>Order History</Text>
                  <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>View past deliveries</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]} onPress={() => navigation.navigate('Notifications')}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                  <Ionicons name="notifications" size={18} color="#EF4444" />
                </View>
                <View>
                  <Text style={[styles.menuText, { color: colors.text }]}>Notification Settings</Text>
                  <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Manage your alerts</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]} onPress={() => navigation.navigate('Support')}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                  <Ionicons name="help-buoy" size={18} color="#10B981" />
                </View>
                <View>
                  <Text style={[styles.menuText, { color: colors.text }]}>Help & Support</Text>
                  <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Contact administration</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('PrivacyPolicy' as any)}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: 'rgba(13,92,255,0.1)' }]}>
                  <Ionicons name="shield-checkmark" size={18} color="#0D5CFF" />
                </View>
                <View>
                  <Text style={[styles.menuText, { color: colors.text }]}>Privacy Policy</Text>
                  <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Location & data terms</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Unique Sign Out Button */}
          <TouchableOpacity
            style={[styles.uniqueLogoutBtn, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2' }]}
            onPress={() => {
              const performLogout = async () => {
                try {
                  // 1. Set driver status to offline on backend
                  await setDriverOnlineStatus('offline').catch(() => { });

                  // 2. Sign out of Firebase Auth session
                  try {
                    const auth = getAuth();
                    await signOut(auth);
                  } catch (fbSignOutErr) {
                    console.warn('Firebase signOut notice:', fbSignOutErr);
                  }

                  // 3. Clear auth/session storage keys while preserving notification read history
                  const { clearSessionKeepNotifications } = require('../../services/asyncStorageShim');
                  await clearSessionKeepNotifications();
                } catch (e) {
                  console.warn('Logout storage clear error:', e);
                }
                if (Platform.OS === 'web') {
                  // Hard reload on web to fully clear in-memory state and force fresh login page
                  (window as any).location.href = '/';
                } else {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login', params: { role: 'driver' } }],
                  });
                }
              };

              if (Platform.OS === 'web') {
                // No Alert.alert on web – directly confirm inline
                performLogout();
              } else {
                Alert.alert('Sign Out', 'Are you sure you want to end your session?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: performLogout,
                  },
                ]);
              }
            }}
          >
            <View style={styles.logoutIconCircle}>
              <Ionicons name="power" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.uniqueLogoutText}>Sign Out</Text>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          </TouchableOpacity>

          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            Anusha Porter Driver v{Constants.expoConfig?.version ?? '2.28.39'} (Production)
          </Text>
        </View>
      </ScrollView>

      {/* ── Edit Profile Modal ──────────────────────────────────────────── */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.editModalOverlay}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={[styles.editModalSheet, { backgroundColor: colors.card }]}>
            {/* Modal Header */}
            <View style={[styles.editModalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.editModalCloseBtn}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.editModalTitle, { color: colors.text }]}>Edit Profile</Text>
              <TouchableOpacity
                style={[styles.editModalSaveBtn, { backgroundColor: colors.primary }, editSaving && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={editSaving}
              >
                {editSaving
                  ? <Ionicons name="hourglass-outline" size={16} color="#FFF" />
                  : <Text style={styles.editModalSaveBtnText}>Save</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.editModalScroll}
              contentContainerStyle={{ paddingBottom: 140 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Personal */}
              <Text style={[styles.editSectionLabel, { color: colors.textSecondary }]}>PERSONAL</Text>
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Ionicons name="person-outline" size={17} color={colors.primary} />
                <TextInput
                  style={[styles.editFieldInput, { color: colors.text }]}
                  placeholder="Full Name"
                  placeholderTextColor={colors.textSecondary}
                  value={editForm.name}
                  onChangeText={t => setEditForm(p => ({ ...p, name: t.replace(/[^a-zA-Z\s]/g, '') }))}
                />
              </View>
              {/* Phone — read-only: it is the login identity and cannot be changed */}
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 8, opacity: 0.6 }]}>
                <Ionicons name="lock-closed-outline" size={17} color={colors.textSecondary} />
                <Text style={[styles.editFieldInput, { color: colors.textSecondary }]}>
                  {editForm.phone || 'Phone number'}
                </Text>
                <View style={{ backgroundColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '700' }}>LOCKED</Text>
                </View>
              </View>

              {/* Vehicle */}
              <Text style={[styles.editSectionLabel, { color: colors.textSecondary }]}>VEHICLE</Text>
              <TouchableOpacity
                style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background, justifyContent: 'space-between' }]}
                onPress={() => setVehicleDropdownOpen(true)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <MaterialCommunityIcons name="car-outline" size={18} color={colors.primary} />
                  <Text
                    style={[
                      styles.editFieldInput,
                      { color: editForm.vehicle ? colors.text : colors.textSecondary, marginLeft: 8 },
                    ]}
                    numberOfLines={1}
                  >
                    {editForm.vehicle || 'Select Vehicle Type'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {loadingVehicles ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                  )}
                </View>
              </TouchableOpacity>
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 8 }]}>
                <MaterialCommunityIcons name="numeric" size={17} color={colors.primary} />
                <TextInput
                  style={[styles.editFieldInput, { color: colors.text }]}
                  placeholder="Vehicle Number (e.g. AP09AB1234)"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="characters"
                  value={editForm.vehicleNumber}
                  onChangeText={t => setEditForm(p => ({ ...p, vehicleNumber: t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() }))}
                />
              </View>

              {/* Address */}
              <Text style={[styles.editSectionLabel, { color: colors.textSecondary }]}>ADDRESS</Text>
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Ionicons name="location-outline" size={17} color="#10B981" />
                <TextInput
                  style={[styles.editFieldInput, { color: colors.text }]}
                  placeholder="Street / Area / Locality"
                  placeholderTextColor={colors.textSecondary}
                  value={editForm.address}
                  onChangeText={t => setEditForm(p => ({ ...p, address: t }))}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <View style={[styles.editFieldRow, { flex: 1, borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Ionicons name="map-outline" size={17} color="#10B981" />
                  <TextInput
                    style={[styles.editFieldInput, { color: colors.text }]}
                    placeholder="City"
                    placeholderTextColor={colors.textSecondary}
                    value={editForm.city}
                    onChangeText={t => setEditForm(p => ({ ...p, city: t.replace(/[^a-zA-Z\s]/g, '') }))}
                  />
                </View>
                <View style={[styles.editFieldRow, { flex: 1, borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Ionicons name="pin-outline" size={17} color="#10B981" />
                  <TextInput
                    style={[styles.editFieldInput, { color: colors.text }]}
                    placeholder="Pincode"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    maxLength={6}
                    value={editForm.pincode}
                    onChangeText={t => setEditForm(p => ({ ...p, pincode: t.replace(/\D/g, '') }))}
                  />
                </View>
              </View>

              {/* Bank & UPI */}
              <Text style={[styles.editSectionLabel, { color: colors.textSecondary }]}>BANK & PAYOUT</Text>
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Ionicons name="person-circle-outline" size={17} color="#F59E0B" />
                <TextInput
                  style={[styles.editFieldInput, { color: colors.text }]}
                  placeholder="Account Holder Name"
                  placeholderTextColor={colors.textSecondary}
                  value={editForm.bankAccountName}
                  onChangeText={t => setEditForm(p => ({ ...p, bankAccountName: t.replace(/[^a-zA-Z\s]/g, '') }))}
                />
              </View>
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 8 }]}>
                <Ionicons name="wallet-outline" size={17} color="#F59E0B" />
                <TextInput
                  style={[styles.editFieldInput, { color: colors.text }]}
                  placeholder="Bank Account Number"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="numeric"
                  value={editForm.bankAccountNumber}
                  onChangeText={t => setEditForm(p => ({ ...p, bankAccountNumber: t.replace(/\D/g, '') }))}
                />
              </View>
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 8 }]}>
                <Ionicons name="barcode-outline" size={17} color="#F59E0B" />
                <TextInput
                  style={[styles.editFieldInput, { color: colors.text }]}
                  placeholder="IFSC Code (e.g. HDFC0001234)"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="characters"
                  maxLength={11}
                  value={editForm.bankIfscCode}
                  onChangeText={t => setEditForm(p => ({ ...p, bankIfscCode: t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() }))}
                />
              </View>
              <View style={[styles.editFieldRow, { borderColor: colors.border, backgroundColor: colors.background, marginTop: 8, marginBottom: 32 }]}>
                <MaterialCommunityIcons name="contactless-payment" size={17} color="#F59E0B" />
                <TextInput
                  style={[styles.editFieldInput, { color: colors.text }]}
                  placeholder="UPI ID (e.g. name@oksbi)"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={editForm.upiId}
                  onChangeText={t => setEditForm(p => ({ ...p, upiId: t }))}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Vehicle Selection Modal (Admin Panel Dynamic Vehicles) */}
      <Modal
        visible={vehicleDropdownOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setVehicleDropdownOpen(false)}
      >
        <View style={styles.editModalOverlay}>
          <View style={[styles.vehicleDropdownSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.vehicleDropdownHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.vehicleDropdownTitle, { color: colors.text }]}>
                  {String(profileData?.serviceType || '').toUpperCase().includes('PASS') ? 'Select Passenger Vehicle' : 'Select Goods Vehicle'}
                </Text>
                <Text style={[styles.vehicleDropdownSubtitle, { color: colors.textSecondary }]}>
                  {availableVehicles.length > 0
                    ? `${availableVehicles.length} ${String(profileData?.serviceType || '').toUpperCase().includes('PASS') ? 'passenger' : 'goods'} vehicles from Admin`
                    : 'Loading vehicles from Admin...'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setVehicleDropdownOpen(false)}
                style={[styles.dropdownCloseBtn, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingVehicles ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
                  Fetching live vehicles from Admin...
                </Text>
              </View>
            ) : availableVehicles.length === 0 ? (
              <View style={{ paddingVertical: 36, alignItems: 'center' }}>
                <MaterialCommunityIcons name="car-off" size={40} color={colors.textSecondary} />
                <Text style={{ marginTop: 12, color: colors.text, fontWeight: '700', fontSize: 15 }}>
                  No Vehicles Available
                </Text>
                <Text style={{ marginTop: 4, color: colors.textSecondary, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 }}>
                  No vehicles currently available in this area.
                </Text>
                <TouchableOpacity
                  onPress={loadVehicles}
                  style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 12 }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Retry Loading</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {availableVehicles.map((v) => {
                  const isSelected =
                    (editForm.vehicle || '').toLowerCase() === v.name.toLowerCase() ||
                    (editForm.vehicleType || '').toLowerCase() === v.name.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={v.id || v.name}
                      style={[
                        styles.vehicleDropdownItem,
                        {
                          backgroundColor: isSelected ? `${colors.primary}15` : colors.background,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setEditForm((p) => ({ ...p, vehicle: v.name, vehicleType: v.name }));
                        setVehicleDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.vehicleItemIconBox, { backgroundColor: isSelected ? colors.primary : `${colors.primary}18`, overflow: 'hidden' }]}>
                        {v.imageUrl && (v.imageUrl.startsWith('http') || v.imageUrl.startsWith('data:') || v.imageUrl.startsWith('file:')) ? (
                          <Image
                            source={{ uri: v.imageUrl }}
                            style={{ width: 52, height: 38 }}
                            resizeMode="contain"
                          />
                        ) : (
                          <MaterialCommunityIcons
                            name={(v.iconName as any) || ((v as any).icon as any) || 'truck-delivery'}
                            size={22}
                            color={isSelected ? '#FFFFFF' : colors.primary}
                          />
                        )}
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.vehicleItemName, { color: colors.text, fontWeight: isSelected ? '800' : '600' }]}>
                          {v.name}
                        </Text>
                        <Text style={[styles.vehicleItemCapacity, { color: colors.textSecondary }]}>
                          {v.capacity || 'Standard Load'}
                        </Text>
                      </View>
                      {isSelected ? (
                        <View style={[styles.vehicleCheckmark, { backgroundColor: colors.primary }]}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </View>
                      ) : (
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Full Screen Document Viewer Modal */}
      <Modal visible={!!selectedDocImage} transparent animationType="fade" onRequestClose={() => setSelectedDocImage(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Document View</Text>
            <TouchableOpacity onPress={() => setSelectedDocImage(null)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          {selectedDocImage && (
            <Image source={{ uri: selectedDocImage }} style={styles.fullScreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  headerSection: {
    height: 180,
    position: 'relative',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  navTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  themeToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySection: {
    alignItems: 'center',
    marginTop: -80,
    paddingHorizontal: 20,
    zIndex: 2,
  },
  avatarWrapper: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  driverName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  partnerId: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  softShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  contentBody: {
    paddingHorizontal: 20,
    marginTop: 30,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  infoCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 26,
    borderWidth: 1,
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailItemLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 10,
    width: 105,
  },
  detailItemValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  fieldDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  vehicleTextCol: {
    flex: 1,
  },
  vehicleMake: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  vehiclePlate: {
    fontSize: 16,
    fontWeight: '800',
  },
  activeTag: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  activeTagText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  kycRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  kycLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  kycIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kycImageThumbnail: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  kycName: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  kycRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kycBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kycStatus: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  menuIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuSubtext: {
    fontSize: 12,
  },
  uniqueLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    padding: 8,
    paddingRight: 20,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  logoutIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  uniqueLogoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
    marginLeft: 16,
    letterSpacing: 0.5,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    zIndex: 10,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '80%',
  },
  // ── Edit Profile Modal ────────────────────────────────────
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  editModalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  editModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(128,128,128,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  editModalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  editModalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  editModalScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  editSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
  },
  editFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  editFieldInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  // ── Vehicle Dropdown Styles ──────────────────────────────────
  vehicleDropdownSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderWidth: 1,
  },
  vehicleDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    marginBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  vehicleDropdownTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  vehicleDropdownSubtitle: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '500',
  },
  dropdownCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1.5,
  },
  vehicleItemIconBox: {
    width: 56,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  vehicleItemName: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
  vehicleItemCapacity: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  vehicleCheckmark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DriverProfileScreen;
