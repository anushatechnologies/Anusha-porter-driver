import React from 'react';
import {
  View,
  Text,
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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { getDriverProfile, getOrderHistory, getDriverPayoutAccount, setDriverOnlineStatus, uploadDriverPhoto } from '../../services/api';
import { cleanUrl } from '../../utils/urlHelpers';
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

  const fetchProfileFreshData = async () => {
    try {
      setImageError(false);
      const data = await AsyncStorage.getItem('driverProfile');
      let localProfile: any = data ? JSON.parse(data) : null;
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
          console.warn('Payout account fetch notice:', accErr);
        }

        const resolvedPhoto = extractPhoto(driverDb, localProfile);

        const cleanDbName = (driverDb.name || '').replace(/Test Driver/gi, '').trim();
        const cleanDbEmail = (driverDb.email || '').replace(/testdriver@example\.com/gi, '').trim();
        const cleanDbVeh = (driverDb.vehicleNumber || '').replace(/TG01AB1234/gi, '').trim();

        const merged = {
          fullName: cleanDbName || localProfile?.fullName || 'Driver Partner',
          mobile: driverDb.phone || localProfile?.mobile || localProfile?.phone || '',
          phone: driverDb.phone || localProfile?.phone || localProfile?.mobile || '',
          email: cleanDbEmail || localProfile?.email || '',
          vehicleType: driverDb.vehicleType || localProfile?.vehicleType || 'Vehicle',
          vehicleNumber: cleanDbVeh || localProfile?.vehicleNumber || '',
          rating: String(driverDb.rating || localProfile?.rating || '5.0'),
          tenure: String(driverDb.tenure || localProfile?.tenure || '0m'),
          kyc: (driverDb.kyc || driverDb.kycStatus || localProfile?.kyc || 'pending'),
          addressLine1: driverDb.addressLine1 || localProfile?.addressLine1 || '',
          city: driverDb.city || localProfile?.city || '',
          state: driverDb.state || localProfile?.state || '',
          pincode: driverDb.pincode || localProfile?.pincode || '',
          bankName: payoutAccount?.bankName || driverDb.bankName || localProfile?.bankName || '',
          accountNumber: payoutAccount?.accountNumberMasked || (driverDb.accountNumber ? `XXXX XXXX ${driverDb.accountNumber.slice(-4)}` : (localProfile?.accountNumber ? `XXXX XXXX ${localProfile.accountNumber.slice(-4)}` : '')),
          ifscCode: payoutAccount?.ifscCode || driverDb.ifscCode || localProfile?.ifscCode || '',
          upiId: payoutAccount?.upiId || localProfile?.upiId || '',
          profilePhotoUri: resolvedPhoto || localProfile?.profilePhotoUri,
          documents: {
            aadhaarUrl: cleanUrl(driverDb.documents?.aadhaarUrl || localProfile?.documents?.aadhaarUrl || ''),
            licenseUrl: cleanUrl(driverDb.documents?.licenseUrl || localProfile?.documents?.licenseUrl || ''),
            rcUrl: cleanUrl(driverDb.documents?.rcUrl || localProfile?.documents?.rcUrl || ''),
            bankPassbookUrl: cleanUrl(driverDb.documents?.bankPassbookUrl || localProfile?.documents?.bankPassbookUrl || ''),
          }
        };

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
          // Step 1: Load what we have from storage immediately to show something
          const data = await AsyncStorage.getItem('driverProfile');
          let localProfile: any = data ? JSON.parse(data) : null;
          if (localProfile) {
            if (localProfile.fullName === 'Test Driver') localProfile.fullName = '';
            if (localProfile.email === 'testdriver@example.com') localProfile.email = '';
            if (localProfile.vehicleNumber === 'TG01AB1234') localProfile.vehicleNumber = '';
            if (isMounted) setProfileData(localProfile);
          }

          // Step 2: Get the logged-in email if available
          const storedEmail = await AsyncStorage.getItem('loggedInEmail') || localProfile?.email;

          // Step 3: Always fetch fresh data from live backend API for all logged in drivers
          try {
            const driverDb = await getDriverProfile();
            if (!isMounted) return;
            if (driverDb) {
              const extractPhoto = (db: any, loc: any): string => {
                const candidates = [
                  db?.profilePhotoUri,
                  db?.profilePhotoUrl,
                  db?.profilePhoto,
                  db?.photo,
                  db?.avatar,
                  db?.avatarUrl,
                  db?.image,
                  db?.imageUrl,
                  db?.profile_photo,
                  db?.profile_photo_url,
                  db?.profile_photo_uri,
                  db?.documents?.profilePhotoUrl,
                  db?.documents?.profile_photo_url,
                  db?.documents?.profilePhotoUri,
                  db?.documents?.profilePhoto,
                  loc?.profilePhotoUri,
                  loc?.profilePhotoUrl,
                  loc?.profilePhoto,
                  loc?.photo,
                  loc?.avatar,
                ];
                for (const c of candidates) {
                  if (c && typeof c === 'string' && c.trim().length > 0) {
                    return cleanUrl(c);
                  }
                }
                return '';
              };

              const rawPhoto = extractPhoto(driverDb, localProfile);

              const merged = {
                ...(localProfile || {}),
                fullName: driverDb.name || localProfile?.fullName || '',
                mobile: driverDb.phone || localProfile?.mobile || '',
                email: driverDb.email || storedEmail || '',
                dob: driverDb.dob || localProfile?.dob || '',
                gender: driverDb.gender || localProfile?.gender || '',
                addressLine1: driverDb.addressLine1 || localProfile?.addressLine1 || '',
                city: driverDb.city || localProfile?.city || '',
                state: driverDb.state || localProfile?.state || '',
                pincode: driverDb.pincode || localProfile?.pincode || '',
                vehicleType: driverDb.vehicleType || localProfile?.vehicleType || '',
                vehicleNumber: driverDb.vehicleNumber || localProfile?.vehicleNumber || '',
                rcNumber: driverDb.rcNumber || localProfile?.rcNumber || '',
                aadhaarNumber: driverDb.aadhaarNumber || localProfile?.aadhaarNumber || '',
                licenseNumber: driverDb.licenseNumber || localProfile?.licenseNumber || '',
                bankName: driverDb.bankName || localProfile?.bankName || '',
                accountHolderName: driverDb.accountHolderName || localProfile?.accountHolderName || '',
                accountNumber: driverDb.accountNumber || localProfile?.accountNumber || '',
                ifscCode: driverDb.ifscCode || localProfile?.ifscCode || '',
                partnerId: driverDb.id ? 'PRT-' + driverDb.id : (localProfile?.partnerId || (localProfile?.mobile ? 'PRT-' + localProfile.mobile.slice(-4) : 'PRT-PENDING')),
                profilePhotoUri: rawPhoto,
                aadhaarUri: cleanUrl(driverDb.aadhaarUri || driverDb.documents?.aadhaarUrl || localProfile?.aadhaarUri || ''),
                licenseUri: cleanUrl(driverDb.licenseUri || driverDb.documents?.licenseUrl || localProfile?.licenseUri || ''),
                rcUri: cleanUrl(driverDb.rcUri || driverDb.documents?.rcUrl || localProfile?.rcUri || ''),
                bankPassbookUri: cleanUrl(driverDb.bankPassbookUri || driverDb.documents?.bankPassbookUrl || localProfile?.bankPassbookUri || ''),
                kyc: driverDb.kyc || driverDb.kycStatus || localProfile?.kyc || 'pending',
                rating: '—',
                trips: driverDb.trips !== undefined ? driverDb.trips : (localProfile?.trips || 0),
                tenure: (() => {
                  const dObj = driverDb as any;
                  const regDate = dObj?.createdAt || dObj?.created_at || dObj?.joinedDate || dObj?.registeredAt || localProfile?.createdAt;
                  if (!regDate) return '0m';
                  const d = new Date(regDate);
                  if (isNaN(d.getTime())) return '0m';
                  const days = Math.floor(Math.abs(Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
                  if (days < 30) return days <= 1 ? '1d' : `${days}d`;
                  const m = Math.floor(days / 30);
                  if (m < 12) return `${m}m`;
                  const y = Math.floor(m / 12);
                  const rem = m % 12;
                  return rem > 0 ? `${y}y ${rem}m` : `${y}y`;
                })(),
              };

              // Fetch actual completed trips count & calculate real-time rating from real order ratings
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
                } else {
                  merged.rating = '—';
                }
              } catch (e) {}

              setProfileData(merged);
              await AsyncStorage.setItem('driverProfile', JSON.stringify(merged));
            }
          } catch (dbErr) {
            console.warn('Backend driver profile update notice:', dbErr);
          }
        } catch (e) {
          console.warn('Failed to load profile from storage:', e);
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
              d={`M0 0 L${width} 0 L${width} 140 Q${width/2} 220 0 140 Z`}
              fill="url(#waveGrad)" 
            />
          </Svg>

          <View style={styles.topNav}>
            <Text style={styles.navTitle}>Profile</Text>
            <TouchableOpacity style={styles.themeToggleBtn} onPress={handleToggleTheme}>
              <Ionicons name={themeIcon as any} size={20} color="#FFFFFF" />
            </TouchableOpacity>
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Personal Details</Text>
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
          {(profileData?.addressLine1 || profileData?.city || profileData?.state || profileData?.pincode) ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Address Details</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && styles.softShadow]}>
                <View style={styles.detailItemRow}>
                  <Ionicons name="location-outline" size={18} color="#10B981" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Address:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.addressLine1 || 'N/A'}</Text>
                </View>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="map-outline" size={18} color="#10B981" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>City / State:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>
                    {[profileData?.city, profileData?.state, profileData?.pincode].filter(Boolean).join(', ') || 'N/A'}
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
                <MaterialCommunityIcons name="bike" size={24} color="#0D5CFF" />
              </View>
              <View style={styles.vehicleTextCol}>
                <Text style={[styles.vehicleMake, { color: colors.textSecondary }]}>{vehicleMake}</Text>
                <Text style={[styles.vehiclePlate, { color: colors.text }]}>{vehiclePlate || 'N/A'}</Text>
              </View>
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>ACTIVE</Text>
              </View>
            </View>
            {!!profileData?.rcNumber && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="document-text-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>RC Number:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.rcNumber}</Text>
                </View>
              </>
            )}
            {!!profileData?.licenseNumber && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="card-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>License No:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.licenseNumber}</Text>
                </View>
              </>
            )}
            {!!profileData?.aadhaarNumber && (
              <>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="finger-print-outline" size={18} color="#0D5CFF" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Aadhaar No:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.aadhaarNumber}</Text>
                </View>
              </>
            )}
          </View>

          {/* Bank Account Details */}
          {(profileData?.bankName || profileData?.accountNumber || profileData?.ifscCode) ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Bank Account Details</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }, !isDark && styles.softShadow]}>
                <View style={styles.detailItemRow}>
                  <Ionicons name="business-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Bank Name:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.bankName || 'N/A'}</Text>
                </View>
                {!!profileData?.accountHolderName && (
                  <>
                    <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.detailItemRow}>
                      <Ionicons name="person-circle-outline" size={18} color="#F59E0B" />
                      <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Holder Name:</Text>
                      <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData.accountHolderName}</Text>
                    </View>
                  </>
                )}
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="wallet-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>Account No:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.accountNumber || 'N/A'}</Text>
                </View>
                <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
                <View style={styles.detailItemRow}>
                  <Ionicons name="barcode-outline" size={18} color="#F59E0B" />
                  <Text style={[styles.detailItemLabel, { color: colors.textSecondary }]}>IFSC Code:</Text>
                  <Text style={[styles.detailItemValue, { color: colors.text }]}>{profileData?.ifscCode || 'N/A'}</Text>
                </View>
              </View>
            </>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings & Support</Text>
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }, !isDark && styles.softShadow]}>
            
            <TouchableOpacity style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]} onPress={() => navigation.navigate('Wallet' as any)}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: 'rgba(0,82,255,0.1)' }]}>
                  <Ionicons name="wallet" size={18} color="#0052FF" />
                </View>
                <View>
                  <Text style={[styles.menuText, { color: colors.text }]}>Operational Driver Wallet</Text>
                  <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>Recharge balance for ride commissions</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>

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

            <TouchableOpacity style={[styles.menuRow, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]} onPress={() => navigation.navigate('PrivacyPolicy' as any)}>
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

            <TouchableOpacity style={styles.menuRow} onPress={() => Alert.alert('Language', 'Choose language:\n• English\n• Hindi')}>
              <View style={styles.menuLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                  <Ionicons name="language" size={18} color="#F59E0B" />
                </View>
                <View>
                  <Text style={[styles.menuText, { color: colors.text }]}>Language</Text>
                  <Text style={[styles.menuSubtext, { color: colors.textSecondary }]}>English (Default)</Text>
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
                  await setDriverOnlineStatus('offline').catch(() => {});

                  // 2. Sign out of Firebase Auth session
                  try {
                    const auth = getAuth();
                    await signOut(auth);
                  } catch (fbSignOutErr) {
                    console.warn('Firebase signOut notice:', fbSignOutErr);
                  }

                  // 3. Completely clear all cached storage keys
                  await AsyncStorage.clear();
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

          <Text style={[styles.versionText, { color: colors.textMuted }]}>Anusha Porter Driver v2.0.0 (Production)</Text>
        </View>
      </ScrollView>

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
});

export default DriverProfileScreen;
