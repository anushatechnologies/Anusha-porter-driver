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
import { getDriverProfile } from '../../services/api';
import { cleanUrl } from '../../utils/urlHelpers';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
const { width, height } = Dimensions.get('window');

const SplashScreen = () => {
  const navigation = useNavigation<NavProp>();
  const { colors, theme } = useTheme();

  const logoScale = React.useRef(new Animated.Value(0.3)).current;
  const logoOpacity = React.useRef(new Animated.Value(0)).current;
  const textOpacity = new Animated.Value(0);

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
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          currentKyc = profile.kyc || 'verified';
          try {
            const driverDb = await getDriverProfile();
            if (driverDb) {
              currentKyc = driverDb.kyc || profile.kyc || 'verified';
              const rawPhoto = driverDb.profilePhotoUri ||
                               driverDb.documents?.profilePhotoUrl ||
                               (driverDb.documents as any)?.profilePhotoUri ||
                               (driverDb as any).profilePhotoUrl ||
                               (driverDb as any).profilePhoto ||
                               profile.profilePhotoUri ||
                               profile.profilePhotoUrl ||
                               '';
              const updatedProfile = {
                ...profile,
                fullName: driverDb.name || profile.fullName,
                mobile: driverDb.phone || profile.mobile,
                vehicleType: driverDb.vehicleType || profile.vehicleType,
                vehicleNumber: driverDb.vehicleNumber || profile.vehicleNumber,
                profilePhotoUri: cleanUrl(rawPhoto),
                aadhaarUri: cleanUrl(driverDb.aadhaarUri || profile.aadhaarUri || ''),
                licenseUri: cleanUrl(driverDb.licenseUri || profile.licenseUri || ''),
                rcUri: cleanUrl(driverDb.rcUri || profile.rcUri || ''),
                bankPassbookUri: cleanUrl(driverDb.bankPassbookUri || profile.bankPassbookUri || ''),
                kyc: currentKyc,
                rejectedReason: driverDb.rejectedReason || '',
              };
              await AsyncStorage.setItem('driverProfile', JSON.stringify(updatedProfile));
            }
          } catch (err) {
            console.warn('Splash status check error:', err);
          }

          if (currentKyc === 'pending') {
            navigation.replace('ApprovalPending');
            return;
          } else if (currentKyc === 'rejected') {
            navigation.replace('DriverRegistration', { mobile: profile.mobile });
            return;
          } else {
            navigation.replace('DriverTabs');
            return;
          }
        }
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
