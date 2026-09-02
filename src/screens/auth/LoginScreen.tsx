import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, ScrollView,
  StatusBar, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions,
  BackHandler, Keyboard, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient, Stop, Rect, Circle, Ellipse } from 'react-native-svg';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import { verifyFirebaseOtp, getDriverProfile, checkDriverPhone, getDriverProfileByPhone } from '../../services/api';
import { cleanUrl } from '../../utils/urlHelpers';
import { validateName, validateMobile } from '../../utils/validators';
import { getAuth, signInWithPhoneNumber } from '@react-native-firebase/auth';

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'Login'>;

const { width, height } = Dimensions.get('window');

const LoginScreen = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();

  const selectedRole = route.params?.role || 'driver';
  const { colors } = useTheme();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // OTP State
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(45);
  const [confirmation, setConfirmation] = useState<any>(null);

  // Custom In-App Pre-Check Dialog Modals
  const [showAccountNotFoundModal, setShowAccountNotFoundModal] = useState(false);
  const [showAlreadyRegisteredModal, setShowAlreadyRegisteredModal] = useState(false);
  const [checkedPhoneDisplay, setCheckedPhoneDisplay] = useState('');
  const [alreadyRegisteredKyc, setAlreadyRegisteredKyc] = useState('verified');

  // Pre-fill phone if passed from Register page redirect
  useEffect(() => {
    const passedPhone = (route.params as any)?.phone || (route.params as any)?.mobile;
    if (passedPhone) {
      setPhone(String(passedPhone).replace(/\D/g, ''));
    }
  }, [route.params]);

  const fullNameInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const otpRefs = [
    useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null),
    useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)
  ];

  const handleFullNameChange = (text: string) => {
    // Only letters and spaces allowed
    const formatted = text.replace(/[^a-zA-Z\s]/g, '');
    setFullName(formatted);
    if (errors.fullName) {
      const res = validateName(formatted, 'Full Name');
      if (res.isValid) {
        setErrors(prev => ({ ...prev, fullName: undefined }));
      } else {
        setErrors(prev => ({ ...prev, fullName: res.error }));
      }
    }
  };

  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 10);
    setPhone(cleaned);
    setOtpMode(false);
    if (errors.phone) {
      const res = validateMobile(cleaned);
      if (res.isValid) {
        setErrors(prev => ({ ...prev, phone: undefined }));
      } else {
        setErrors(prev => ({ ...prev, phone: res.error }));
      }
    }
  };

  const handleBlur = (field: 'fullName' | 'phone') => {
    setFocusedInput(null);
    if (field === 'fullName' && isRegisterMode) {
      if (fullName.trim()) {
        const res = validateName(fullName, 'Full Name');
        setErrors(prev => ({ ...prev, fullName: res.isValid ? undefined : res.error }));
      }
    } else if (field === 'phone') {
      if (phone.trim()) {
        const res = validateMobile(phone);
        setErrors(prev => ({ ...prev, phone: res.isValid ? undefined : res.error }));
      }
    }
  };

  const handleBack = () => {
    if (otpMode) {
      setOtpMode(false);
      setOtp(['', '', '', '', '', '']);
      return true;
    }
    if (isRegisterMode) {
      setIsRegisterMode(false);
      return true;
    }
    
    // Show clean Exit Confirmation Popup on Login screen
    Alert.alert(
      'Exit App',
      'Do you want to exit Anusha Porter?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => BackHandler.exitApp(),
        },
      ],
      { cancelable: true }
    );
    return true;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [otpMode, isRegisterMode, navigation]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (otpMode && countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [otpMode, countdown]);

  const handleSendOtp = async () => {
    Keyboard.dismiss();
    const newErrors: { fullName?: string; phone?: string } = {};

    if (isRegisterMode) {
      const nameRes = validateName(fullName, 'Full Name');
      if (!nameRes.isValid) {
        newErrors.fullName = nameRes.error;
      }
    }

    const phoneRes = validateMobile(phone);
    if (!phoneRes.isValid) {
      newErrors.phone = phoneRes.error;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      Alert.alert('Validation Error', newErrors.fullName || newErrors.phone || 'Please enter valid details.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (loading) return;
    setLoading(true);

    // ── DATABASE PRE-CHECK: Check if phone exists BEFORE sending OTP ──
    try {
      if (selectedRole === 'driver') {
        const phoneCheck = await checkDriverPhone(cleanPhone);

        if (phoneCheck && phoneCheck.success) {
          // If on Login tab and account does NOT exist in DB -> Show "Account Not Found"
          if (!isRegisterMode && phoneCheck.exists === false) {
            setLoading(false);
            setCheckedPhoneDisplay(cleanPhone);
            setShowAccountNotFoundModal(true);
            return;
          }

          // If on Create Account tab and account IS already fully registered -> Show "Already Registered"
          if (isRegisterMode && phoneCheck.isFullyRegistered === true) {
            setLoading(false);
            setCheckedPhoneDisplay(cleanPhone);
            const kyc = String(phoneCheck.driver?.kyc || (phoneCheck.driver as any)?.kycStatus || 'verified').toLowerCase();
            setAlreadyRegisteredKyc(kyc);
            setShowAlreadyRegisteredModal(true);
            return;
          }
        }
      }
    } catch (checkErr) {
      console.warn('[AUTH] Pre-OTP phone check notice:', checkErr);
    }

    // Proceed to send Firebase SMS OTP
    const formattedPhone = `+91${cleanPhone}`;

    try {
      console.log('[AUTH] Send OTP started for:', formattedPhone);
      const auth = getAuth();
      const confirmResult = await signInWithPhoneNumber(auth, formattedPhone);

      if (!confirmResult) {
        throw new Error('Firebase Phone Auth service is unavailable. Please check your connection.');
      }

      console.log('[AUTH] Real SMS OTP dispatched via Firebase');
      setConfirmation(confirmResult);
      setLoading(false);
      setOtpMode(true);
      setCountdown(45);
      setTimeout(() => {
        otpRefs[0].current?.focus();
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
    } catch (error: any) {
      console.error('[AUTH] Send OTP error:', error);
      setLoading(false);

      let errMsg = 'Failed to send OTP. Please check the mobile number and try again.';
      if (error?.code === 'auth/invalid-phone-number') {
        errMsg = 'Invalid mobile number format. Please enter a valid 10-digit mobile number.';
      } else if (error?.code === 'auth/too-many-requests') {
        errMsg = 'Too many OTP requests from this phone. Please wait a few minutes before trying again.';
      } else if (error?.code === 'auth/quota-exceeded') {
        errMsg = 'SMS quota exceeded for today. Please try again later.';
      } else if (error?.code === 'auth/missing-client-identifier' || error?.code === 'auth/app-not-authorized') {
        errMsg = 'App verification in progress. Please check your internet connection and tap Send OTP again.';
      } else if (error?.code === 'auth/network-request-failed') {
        errMsg = 'Network connection failed. Please check your internet connection and try again.';
      } else if (error?.message) {
        errMsg = error.message;
      }
      Alert.alert('Send OTP Failed', errMsg);
    }
  };

  const scrollViewRef = useRef<ScrollView>(null);

  const handleOtpChange = (text: string, index: number) => {
    const clean = text.replace(/\D/g, '');

    // Support SMS autofill / pasting full 6 digits into any box
    if (clean.length > 1) {
      const digits = clean.slice(0, 6).split('');
      const newOtp = [...otp];
      digits.forEach((d, i) => {
        if (i < 6) newOtp[i] = d;
      });
      setOtp(newOtp);
      if (digits.length >= 6) {
        Keyboard.dismiss();
        otpRefs[5].current?.focus();
        scrollViewRef.current?.scrollToEnd({ animated: true });
      } else {
        otpRefs[Math.min(digits.length, 5)].current?.focus();
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = clean;
    setOtp(newOtp);

    // Auto-advance to next box smoothly
    if (clean.length === 1 && index < 5) {
      otpRefs[index + 1].current?.focus();
    } else if (clean.length === 1 && index === 5) {
      Keyboard.dismiss();
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (otp[index] === '' && index > 0) {
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
        otpRefs[index - 1].current?.focus();
      }
    }
  };

  const handleLogin = async () => {
    const otpString = otp.join('');
    if (otpString.length < 6) {
      Alert.alert('Incomplete', 'Please enter the full 6-digit OTP received via SMS.');
      return;
    }

    if (!confirmation || typeof confirmation.confirm !== 'function') {
      Alert.alert('Session Expired', 'OTP session has expired. Please request a new OTP.');
      return;
    }

    setLoading(true);
    let firebaseIdToken = '';
    let firebasePhone = '';
    let firebaseUid = '';

    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);

    try {
      const confirmPromise = confirmation.confirm(otpString);
      const fbTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OTP verification request timed out. Please check your internet connection and try again.')), 10000)
      );
      const firebaseUser = await Promise.race([confirmPromise, fbTimeout]);
      const userObj = (firebaseUser as any)?.user || firebaseUser;
      if (userObj && typeof userObj.getIdToken === 'function') {
        firebaseIdToken = await userObj.getIdToken(false);
        firebasePhone = userObj.phoneNumber || userObj.phone_number || `+91${cleanPhone}`;
        firebaseUid = userObj.uid || '';
        console.log('[AUTH] Real Firebase Phone OTP verified! Phone:', firebasePhone, 'UID:', firebaseUid);
      } else {
        throw new Error('Firebase Auth token generation failed. Please try again.');
      }
    } catch (fbErr: any) {
      console.error('[AUTH] Firebase OTP verification failed:', fbErr);
      setLoading(false);
      let errMsg = 'Invalid OTP code. Please check the 6-digit SMS code received on your phone and try again.';
      if (fbErr?.code === 'auth/invalid-verification-code') {
        errMsg = 'The 6-digit OTP code entered is incorrect. Please re-check your SMS message and try again.';
      } else if (fbErr?.code === 'auth/session-expired' || fbErr?.code === 'auth/code-expired') {
        errMsg = 'This OTP has expired. Please tap "Resend OTP" to request a new code.';
      } else if (fbErr?.message) {
        errMsg = fbErr.message;
      }
      Alert.alert('OTP Verification Failed', errMsg);
      return;
    }

    try {
      // Phone from Firebase (strip +91 for backend lookup)
      const verifiedPhone = (firebasePhone || `+91${cleanPhone}`).replace(/^\+91/, '');

      // Execute backend sync and profile lookup in fast parallel with 2.5s timeout
      let data: any = null;
      let driverDb: any = null;

      try {
        const syncRes = await verifyFirebaseOtp(
          firebaseIdToken,
          isRegisterMode ? 'signup' : 'login',
          isRegisterMode ? fullName : undefined,
          'driver',
          cleanPhone || phone
        );
        data = syncRes;

        const effectiveToken = (data && data.success && (data.accessToken || data.token))
          ? (data.accessToken || data.token)
          : firebaseIdToken;

        const profileByPhone = await getDriverProfileByPhone(cleanPhone || phone);
        const profileByToken = !profileByPhone ? await getDriverProfile(effectiveToken) : null;
        driverDb = profileByPhone || profileByToken || (data && (data.driver || data.user || (data.data && typeof data.data === 'object' ? data.data : null)));
      } catch (syncErr) {
        console.warn('[AUTH] Background sync notice:', syncErr);
      }

      const token = (data && data.success && (data.accessToken || data.token))
        ? (data.accessToken || data.token)
        : firebaseIdToken;

      // Completely wipe any previous session to guarantee 100% multi-user isolation
      await AsyncStorage.clear();

      await AsyncStorage.setItem('userToken', cleanPhone || phone);
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('firebasePhone', firebasePhone);
      await AsyncStorage.setItem('firebaseUid', firebaseUid);

      if (selectedRole === 'admin') {
        setLoading(false);
        navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
        return;
      }

      if (driverDb) {
        const kycStatus = (driverDb.kyc || driverDb.kycStatus || 'pending') as 'verified' | 'pending' | 'rejected';
        const profileData = {
          fullName: String(driverDb.name || fullName || 'Driver'),
          mobile: String(driverDb.phone || cleanPhone || phone),
          email: String(driverDb.email || ''),
          dob: String(driverDb.dob || ''),
          gender: String(driverDb.gender || ''),
          addressLine1: String(driverDb.addressLine1 || ''),
          city: String(driverDb.city || ''),
          state: String(driverDb.state || ''),
          pincode: String(driverDb.pincode || ''),
          vehicleType: String(driverDb.vehicleType || ''),
          vehicleNumber: String(driverDb.vehicleNumber || ''),
          rcNumber: String(driverDb.rcNumber || ''),
          aadhaarNumber: String(driverDb.aadhaarNumber || ''),
          licenseNumber: String(driverDb.licenseNumber || ''),
          bankName: String(driverDb.bankName || ''),
          accountHolderName: String(driverDb.accountHolderName || ''),
          accountNumber: String(driverDb.accountNumber || ''),
          ifscCode: String(driverDb.ifscCode || ''),
          partnerId: driverDb.id ? 'PRT-' + driverDb.id : 'PRT-' + (cleanPhone || phone).slice(-4),
          profilePhotoUri: cleanUrl(
            driverDb.profilePhotoUri ||
            driverDb.documents?.profilePhotoUrl ||
            driverDb.documents?.profilePhotoUri ||
            (driverDb as any).profilePhotoUrl ||
            (driverDb as any).profilePhoto ||
            ''
          ),
          aadhaarUri: cleanUrl(driverDb.aadhaarUri || driverDb.documents?.aadhaarUrl || ''),
          licenseUri: cleanUrl(driverDb.licenseUri || driverDb.documents?.licenseUrl || ''),
          rcUri: cleanUrl(driverDb.rcUri || driverDb.documents?.rcUrl || ''),
          bankPassbookUri: cleanUrl(driverDb.bankPassbookUri || driverDb.documents?.bankPassbookUrl || ''),
          kyc: kycStatus,
          rejectedReason: String(driverDb.rejectedReason || ''),
          rating: String(driverDb.rating || '5.0'),
          trips: driverDb.trips !== undefined ? Number(driverDb.trips) : 0,
          tenure: String(driverDb.tenure || '0m'),
        };

        await AsyncStorage.setItem('driverProfile', JSON.stringify(profileData));
        if (profileData.email) await AsyncStorage.setItem('loggedInEmail', profileData.email);

        setLoading(false);
        const normalizedKyc = String(kycStatus).toLowerCase();

        // Check if driver has REAL registration data (not just a bare appuser record from OTP)
        const hasRealName = Boolean(
          profileData.fullName && profileData.fullName !== 'Driver' && profileData.fullName !== 'null' && profileData.fullName.trim().length > 1
        );
        const hasVehicleData = Boolean(profileData.vehicleNumber || driverDb.vehicleNumber);
        const hasDocData = Boolean(
          profileData.aadhaarNumber || driverDb.aadhaarNumber ||
          profileData.licenseNumber || driverDb.licenseNumber ||
          profileData.aadhaarUri || profileData.licenseUri ||
          driverDb.documents
        );
        const hasCompletedKyc = hasRealName && hasVehicleData && hasDocData;

        // If the driver is in Create Account mode OR has not submitted their 5 steps, open Registration
        if (isRegisterMode || !hasCompletedKyc) {
          navigation.navigate('DriverRegistration', {
            mobile: profileData.mobile || cleanPhone || phone,
            firebaseIdToken,
            fullName: profileData.fullName || fullName || '',
          });
          return;
        }

        // Only approved drivers can access the Dashboard
        if (normalizedKyc === 'verified' || normalizedKyc === 'approved') {
          navigation.reset({ index: 0, routes: [{ name: 'DriverTabs' }] });
        } else if (normalizedKyc === 'rejected') {
          navigation.navigate('DriverRegistration', { mobile: profileData.mobile, firebaseIdToken, fullName: profileData.fullName });
        } else {
          // New registration or pending approval — hold in ApprovalPending
          navigation.reset({ index: 0, routes: [{ name: 'ApprovalPending' }] });
        }
      } else {
        // Driver profile not found on backend — navigate to Registration to complete 5 steps
        setLoading(false);
        navigation.navigate('DriverRegistration', { mobile: cleanPhone || phone, firebaseIdToken, fullName: fullName || '' });
      }
    } catch (generalErr: any) {
      console.error('[AUTH] Post-OTP navigation error:', generalErr);
      setLoading(false);
      // Fallback navigation to registration with verified token
      navigation.navigate('DriverRegistration', { mobile: cleanPhone || phone, firebaseIdToken, fullName: fullName || '' });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F9FF" />

      {/* Background Gradient */}
      <View style={styles.backgroundContainer}>
        <Svg width={width} height={height} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F5F9FF" stopOpacity="1" />
              <Stop offset="0.6" stopColor="#E0ECFF" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={height} fill="url(#bgGrad)" />
        </Svg>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Brand Header */}
          <View style={styles.brandHeader}>
            <View style={styles.logoBadgeContainer}>
              <Image
                source={require('../../../assets/splash-icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandTitle}>ANUSHA PORTER</Text>
            <View style={styles.roleTag}>
              <Ionicons name="flash" size={11} color="#0052FF" />
              <Text style={styles.roleTagText}>DELIVERY PARTNER</Text>
            </View>
          </View>

          {/* White Login Card */}
          <View style={styles.loginCard}>
            <Text style={styles.welcomeText}>{isRegisterMode ? 'Create Account' : 'Welcome Back!'}</Text>
            <Text style={styles.subWelcomeText}>{isRegisterMode ? 'Register to start delivering' : 'Login to continue delivering'}</Text>

            {isRegisterMode && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <Pressable
                  style={[
                    styles.inputRow,
                    focusedInput === 'fullName' && styles.inputRowFocused,
                    errors.fullName && styles.inputRowError,
                  ]}
                  onPress={() => fullNameInputRef.current?.focus()}
                >
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={errors.fullName ? '#EF4444' : focusedInput === 'fullName' ? '#0052FF' : '#94A3B8'}
                    style={{ marginLeft: 14, marginRight: 6 }}
                  />
                  <TextInput
                    ref={fullNameInputRef}
                    style={styles.inputField}
                    placeholder="Enter your full legal name"
                    placeholderTextColor="#94A3B8"
                    value={fullName}
                    onChangeText={handleFullNameChange}
                    onFocus={() => setFocusedInput('fullName')}
                    onBlur={() => handleBlur('fullName')}
                    autoCapitalize="words"
                    maxLength={50}
                    multiline={false}
                    numberOfLines={1}
                  />
                </Pressable>
                {errors.fullName && (
                  <View style={styles.errorBoxRow}>
                    <Ionicons name="warning-outline" size={13} color="#EF4444" />
                    <Text style={styles.errorText}>{errors.fullName}</Text>
                  </View>
                )}
              </View>
            )}

            <View style={{ marginBottom: 8 }}>
              <Text style={styles.inputLabel}>Mobile Number</Text>
              <Pressable
                style={[
                  styles.inputRow,
                  focusedInput === 'phone' && styles.inputRowFocused,
                  errors.phone && styles.inputRowError,
                ]}
                onPress={() => phoneInputRef.current?.focus()}
              >
                <View style={styles.countryCodeBox}>
                  <Text style={styles.flagText}>🇮🇳</Text>
                  <Text style={styles.countryCodeText}>+91</Text>
                  <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
                </View>
                <View style={styles.inputDivider} />
                <TextInput
                  ref={phoneInputRef}
                  style={styles.inputField}
                  placeholder="Enter 10-digit mobile number"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={10}
                  multiline={false}
                  numberOfLines={1}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  onFocus={() => setFocusedInput('phone')}
                  onBlur={() => handleBlur('phone')}
                />
              </Pressable>
              {errors.phone && (
                <View style={styles.errorBoxRow}>
                  <Ionicons name="warning-outline" size={13} color="#EF4444" />
                  <Text style={styles.errorText}>{errors.phone}</Text>
                </View>
              )}
            </View>

            {!otpMode && (
              <View style={styles.shieldRow}>
                <Ionicons name="shield-checkmark" size={14} color="#0052FF" />
                <Text style={styles.shieldText}>We'll send you a One Time Password</Text>
              </View>
            )}

            {otpMode && (
              <View style={styles.otpSection}>
                <View style={styles.otpLabelRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.inputLabel}>Enter OTP</Text>
                    <TouchableOpacity
                      onPress={() => { setOtpMode(false); setOtp(['', '', '', '', '', '']); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: 12, color: '#0052FF', fontWeight: '700', marginBottom: 8 }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.timerText}>00:{countdown.toString().padStart(2, '0')}</Text>
                </View>

                <View style={styles.otpBoxesRow}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={otpRefs[index]}
                      style={[
                        styles.otpBox,
                        focusedInput === `otp${index}` && styles.otpBoxFocused,
                        digit.length > 0 && styles.otpBoxFilled,
                      ]}
                      keyboardType="number-pad"
                      maxLength={6}
                      value={digit}
                      onChangeText={(text) => handleOtpChange(text, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      onFocus={() => setFocusedInput(`otp${index}`)}
                      onBlur={() => setFocusedInput(null)}
                      selectTextOnFocus
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                    />
                  ))}
                </View>

                <View style={styles.resendRow}>
                  <Text style={styles.resendLabel}>Didn't receive OTP? </Text>
                  <TouchableOpacity onPress={countdown === 0 ? handleSendOtp : undefined}>
                    <Text style={[styles.resendActive, countdown > 0 && { color: '#94A3B8' }]}>Resend OTP</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Action Button */}
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabledBtn]}
              onPress={otpMode ? handleLogin : handleSendOtp}
              disabled={loading || (otpMode ? otp.join('').length < 6 : phone.length < 10)}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <View style={styles.btnContent}>
                  <Text style={styles.primaryBtnText}>{otpMode ? (isRegisterMode ? 'Verify & Register' : 'Verify & Login') : 'Send OTP'}</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* New to Anusha Porter */}
          <View style={styles.registerPrompt}>
            <Text style={styles.registerPromptText}>{isRegisterMode ? 'Already have an account? ' : 'New to Anusha Porter? '}</Text>
            <TouchableOpacity
              onPress={() => {
                setIsRegisterMode(!isRegisterMode);
                setFullName('');
                setPhone('');
                setErrors({});
                setOtpMode(false);
                setOtp(['', '', '', '', '', '']);
              }}
            >
              <Text style={styles.registerNowText}>{isRegisterMode ? 'Login Now' : 'Register Now'} <Ionicons name="chevron-forward" size={12} /></Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Account Not Found In-App Modal Dialog */}
      <Modal
        visible={showAccountNotFoundModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccountNotFoundModal(false)}
      >
        <View style={styles.customAlertOverlay}>
          <View style={styles.customAlertCard}>
            <View style={[styles.customAlertIconBg, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="alert-circle" size={36} color="#D97706" />
            </View>
            <Text style={styles.customAlertTitle}>Account Not Found</Text>
            <Text style={styles.customAlertMsg}>
              The mobile number <Text style={{ fontWeight: '800', color: '#0F172A' }}>+91 {checkedPhoneDisplay}</Text> is not registered yet.{'\n\n'}Please register to create your driver partner account.
            </Text>
            <View style={styles.customAlertBtnRow}>
              <TouchableOpacity
                style={styles.customAlertBtnCancel}
                onPress={() => setShowAccountNotFoundModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.customAlertBtnCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.customAlertBtnPrimary}
                onPress={() => {
                  setShowAccountNotFoundModal(false);
                  setIsRegisterMode(true);
                  setTimeout(() => fullNameInputRef.current?.focus(), 250);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.customAlertBtnPrimaryTxt}>Register Now</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Already Registered In-App Modal Dialog */}
      <Modal
        visible={showAlreadyRegisteredModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAlreadyRegisteredModal(false)}
      >
        <View style={styles.customAlertOverlay}>
          <View style={styles.customAlertCard}>
            <View style={[styles.customAlertIconBg, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="information-circle" size={36} color="#0052FF" />
            </View>
            <Text style={styles.customAlertTitle}>
              {alreadyRegisteredKyc === 'pending' ? 'Verification In Progress' : 'Already Registered'}
            </Text>
            <Text style={styles.customAlertMsg}>
              {alreadyRegisteredKyc === 'pending'
                ? `Your registration for +91 ${checkedPhoneDisplay} is already submitted and is currently under review by our onboarding team.\n\nPlease login directly to check approval status.`
                : `The mobile number +91 ${checkedPhoneDisplay} is already registered.\n\nPlease login directly to access your driver dashboard.`}
            </Text>
            <View style={styles.customAlertBtnRow}>
              <TouchableOpacity
                style={styles.customAlertBtnCancel}
                onPress={() => setShowAlreadyRegisteredModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.customAlertBtnCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.customAlertBtnPrimary}
                onPress={() => {
                  setShowAlreadyRegisteredModal(false);
                  setIsRegisterMode(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.customAlertBtnPrimaryTxt}>Go to Login</Text>
                <Ionicons name="log-in-outline" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  backgroundContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scrollContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? 16 : 24,
    paddingBottom: 48,
    paddingHorizontal: 16,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoBadgeContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0052FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  logoImage: {
    width: '80%',
    height: '80%',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1.2,
  },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0052FF',
    letterSpacing: 0.8,
  },
  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 8,
    marginVertical: 8,
  },
  welcomeText: { fontSize: 22, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  subWelcomeText: { fontSize: 13, color: '#64748B', fontWeight: '500', textAlign: 'center', marginTop: 4, marginBottom: 24 },

  inputLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    height: 52,
    backgroundColor: '#FFFFFF',
  },
  inputRowFocused: { borderColor: '#0052FF', backgroundColor: '#F8FAFC' },
  inputRowError: { borderColor: '#EF4444', borderWidth: 1.5 },
  errorBoxRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 4 },
  errorText: { color: '#EF4444', fontSize: 12, fontWeight: '600' },
  countryCodeBox: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 8 },
  flagText: { fontSize: 18, marginRight: 4 },
  countryCodeText: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  inputDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0', marginRight: 10 },
  inputField: { flex: 1, fontSize: 14, fontWeight: '500', color: '#0F172A', height: '100%', paddingVertical: 0 },

  shieldRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  shieldText: { fontSize: 12, color: '#64748B', fontWeight: '500', marginLeft: 6 },

  otpSection: { marginTop: 16 },
  otpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  timerText: { fontSize: 13, fontWeight: '700', color: '#0052FF' },
  otpBoxesRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  otpBox: {
    width: 46,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  otpBoxFocused: { borderColor: '#0052FF', backgroundColor: '#F0F6FF', borderWidth: 2 },
  otpBoxFilled: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  resendLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  resendActive: { fontSize: 13, color: '#0052FF', fontWeight: '700' },

  primaryBtn: {
    backgroundColor: '#0052FF',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#0052FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: { opacity: 0.6 },
  btnContent: { flexDirection: 'row', alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  registerPrompt: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 16 },
  registerPromptText: { fontSize: 14, color: '#64748B', fontWeight: '500' },
  registerNowText: { fontSize: 14, color: '#0052FF', fontWeight: '700' },

  // Custom In-App Alert Modal Styles
  customAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  customAlertCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  customAlertIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  customAlertTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  customAlertMsg: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  customAlertBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  customAlertBtnCancel: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  customAlertBtnCancelTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
  },
  customAlertBtnPrimary: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0052FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0052FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  customAlertBtnPrimaryTxt: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default LoginScreen;
