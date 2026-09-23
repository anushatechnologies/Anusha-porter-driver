import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  Image,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import { getDriverProfile, getRegistrationProgress } from '../../services/api';
import { safeRequestPermission } from '../../services/fcmService';
import { cleanUrl } from '../../utils/urlHelpers';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const { width, height } = Dimensions.get('window');

const SplashScreen = () => {
  const navigation = useNavigation<NavProp>();
  const { colors, theme } = useTheme();

  const logoScale = React.useRef(new Animated.Value(0.3)).current;
  const logoOpacity = React.useRef(new Animated.Value(0)).current;
  const textOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate logo entrance
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Check saved session & navigate appropriately
    const checkAuthAndNavigate = async () => {
      // Trigger OS Notification Allow Permission prompt on app launch
      safeRequestPermission().catch(() => {});

      // Delay to show branding animation smoothly
      await new Promise(resolve => setTimeout(resolve, 1800));

      try {
        const token = await AsyncStorage.getItem('userToken');
        const profileStr = await AsyncStorage.getItem('driverProfile');

        if (!token) {
          // No user token found -> go straight to Login screen
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login', params: { role: 'driver' } }],
          });
          return;
        }

        // Check KYC status & profile completeness if token exists
        let currentKyc = 'pending';
        let profile: any = null;
        if (profileStr) {
          try {
            profile = JSON.parse(profileStr);
          } catch (e) {
            console.warn('[Splash] Invalid profile JSON in storage, clearing cache:', e);
            await AsyncStorage.removeItem('driverProfile');
            profile = null;
          }
        }

        // ── STEP 1: Call GET /api/drivers/register/progress (backend's source of truth) ──
        let progressData: any = null;
        try {
          const phoneForProgress = (profile?.mobile || token || '').replace(/\D/g, '').slice(-10);
          progressData = await getRegistrationProgress(phoneForProgress);
        } catch (err) {
          console.warn('[Splash] getRegistrationProgress failed:', err);
        }

        // If the progress endpoint returned a clear answer, trust it completely
        if (progressData?.success) {
          const backendIsRegistered = progressData.isRegistered === true;
          const backendKycStatus = String(progressData.kycStatus || '').toLowerCase();
          const backendStep = Number(progressData.registrationStep || 0);

          if (backendIsRegistered && (backendKycStatus === 'approved' || backendKycStatus === 'verified')) {
            // Fully registered & approved → Dashboard
            if (profile) {
              await AsyncStorage.setItem('driverProfile', JSON.stringify({
                ...profile, isRegistered: true, registrationCompleted: true,
                registrationStep: 5, kyc: 'approved', kycStatus: 'approved',
              }));
            }
            navigation.replace('DriverTabs');
            return;
          }

          if (!backendIsRegistered || backendKycStatus === 'draft') {
            // Incomplete registration draft → Resume at the correct step
            const resumeStep = backendStep >= 1 && backendStep <= 4 ? backendStep : 1;
            navigation.replace('DriverRegistration', {
              mobile: profile?.mobile || progressData.phone,
              fullName: profile?.fullName || progressData.name,
              registrationStep: resumeStep,
              draftData: progressData,
            });
            return;
          }

          if (backendKycStatus === 'pending') {
            navigation.replace('ApprovalPending');
            return;
          }

          if (backendKycStatus === 'rejected') {
            navigation.replace('DriverRegistration', {
              mobile: profile?.mobile || progressData.phone,
              fullName: profile?.fullName || progressData.name,
            });
            return;
          }
        }

        // ── STEP 2: Fallback — fetch driver profile if progress endpoint unavailable ──
        let driverDb: any = null;
        try {
          driverDb = await getDriverProfile();
          if (driverDb) {
            const cleanDbPhone = (driverDb.phone || '').replace(/\D/g, '').slice(-10);
            const cleanStoredPhone = (profile?.mobile || token || '').replace(/\D/g, '').slice(-10);
            if (cleanDbPhone && cleanStoredPhone && cleanDbPhone !== cleanStoredPhone) {
              // Identity mismatch — wipe cross-account cache and force clean login
              await AsyncStorage.clear();
              navigation.replace('Login', { role: 'driver' });
              return;
            }

            // FIX: Default KYC to 'pending' (NOT 'verified') — draft drivers must not be auto-approved
            currentKyc = driverDb.kycStatus || driverDb.kyc || profile?.kycStatus || profile?.kyc || 'pending';
            const rawPhoto = driverDb.profilePhotoUri ||
                             driverDb.documents?.profilePhotoUrl ||
                             (driverDb.documents as any)?.profilePhotoUri ||
                             (driverDb as any).profilePhotoUrl ||
                             (driverDb as any).profilePhoto ||
                             profile?.profilePhotoUri ||
                             profile?.profilePhotoUrl ||
                             '';
            const updatedProfile = {
              ...(profile || {}),
              fullName: driverDb.name || profile?.fullName,
              mobile: driverDb.phone || profile?.mobile,
              vehicleType: driverDb.vehicleType || profile?.vehicleType,
              panNumber: driverDb.panNumber || profile?.panNumber || '',
              panUri: cleanUrl(driverDb.panUri || driverDb.panUrl || driverDb.documents?.panUrl || (driverDb.documents as any)?.panUri || profile?.panUri || ''),
              profilePhotoUri: cleanUrl(rawPhoto),
              aadhaarUri: cleanUrl(driverDb.aadhaarUri || profile?.aadhaarUri || ''),
              licenseUri: cleanUrl(driverDb.licenseUri || profile?.licenseUri || ''),
              rcUri: cleanUrl(driverDb.rcUri || profile?.rcUri || ''),
              bankPassbookUri: cleanUrl(driverDb.bankPassbookUri || profile?.bankPassbookUri || ''),
              kyc: currentKyc,
              kycStatus: currentKyc,
              isRegistered: Boolean(
                driverDb.isRegistered === true ||
                driverDb.registrationCompleted === true ||
                (currentKyc === 'approved' || currentKyc === 'verified')
              ),
              registrationCompleted: Boolean(
                driverDb.isRegistered === true ||
                driverDb.registrationCompleted === true ||
                (currentKyc === 'approved' || currentKyc === 'verified')
              ),
              // FIX: Default registrationStep to 0 (NOT 5) — unknown step must not skip registration
              registrationStep: Number(driverDb.registrationStep || profile?.registrationStep || 0),
              rejectedReason: driverDb.rejectedReason || '',
            };
            await AsyncStorage.setItem('driverProfile', JSON.stringify(updatedProfile));
            profile = updatedProfile;
          }
        } catch (err) {
          console.warn('Splash status check error:', err);
        }

        // ── STEP 3: Final routing decision (fallback path) ──
        if (currentKyc === 'pending') {
          navigation.replace('ApprovalPending');
          return;
        }

        const isApproved = currentKyc === 'approved' || currentKyc === 'verified';
        const isRegistered = Boolean(
          (driverDb as any)?.isRegistered === true ||
          (driverDb as any)?.registrationCompleted === true ||
          profile?.isRegistered === true ||
          profile?.registrationCompleted === true ||
          isApproved
        );

        if (isRegistered && isApproved) {
          // Already registered & approved driver -> Go directly to DriverTabs!
          navigation.replace('DriverTabs');
          return;
        }

        // Driver has a draft or incomplete registration → resume
        const savedStep = Number(profile?.registrationStep || 0);
        if (savedStep > 0 && savedStep < 5) {
          navigation.replace('DriverRegistration', {
            mobile: profile?.mobile,
            fullName: profile?.fullName,
            registrationStep: savedStep,
          });
          return;
        }

        if (currentKyc === 'rejected') {
          navigation.replace('DriverRegistration', { mobile: profile?.mobile, fullName: profile?.fullName });
          return;
        }

        // No clear state — send to registration as a fresh start
        navigation.replace('DriverRegistration', { mobile: profile?.mobile, fullName: profile?.fullName });
        return;
      } catch (e) {
        console.log('AsyncStorage error:', e);
      }
      navigation.replace('Login', { role: 'driver' });
    };

    checkAuthAndNavigate();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Background circles */}
      <View style={[styles.circle1, { backgroundColor: colors.primary }]} />
      <View style={[styles.circle2, { backgroundColor: colors.primary }]} />
      <View style={[styles.circle3, { backgroundColor: colors.warning }]} />

      <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
        <View style={[styles.logoBox, { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1.5, shadowColor: colors.primary }]}>
          <Image 
            source={require('../../../assets/splash-icon.png')} 
            style={styles.splashLogo} 
            resizeMode="contain"
          />
        </View>
        <Animated.View style={{ opacity: textOpacity }}>
          <Text style={[styles.appName, { color: colors.text }]}>ANUSHA PORTER DRIVER</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>Official Partner App</Text>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.bottomText, { opacity: textOpacity }]}>
        <Text style={[styles.versionText, { color: colors.textMuted }]}>v2.0.0 • Anusha Porter Driver</Text>
        <View style={[styles.loader, { backgroundColor: colors.accent }]}>
          <View style={[styles.loaderBar, { backgroundColor: colors.primary }]} />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.08,
    top: -80,
    right: -80,
  },
  circle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.06,
    bottom: 100,
    left: -60,
  },
  circle3: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    opacity: 0.05,
    top: height * 0.3,
    right: -40,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoBox: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  splashLogo: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 2,
    marginTop: 6,
  },
  bottomText: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    marginBottom: 16,
  },
  loader: {
    width: 120,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  loaderBar: {
    width: '70%',
    height: '100%',
    borderRadius: 2,
  },
});

export default SplashScreen;
