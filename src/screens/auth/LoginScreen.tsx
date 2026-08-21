import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet, ScrollView,
  StatusBar, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions,
  BackHandler, Keyboard, Image,
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

  useEffect(() => {
    const onBackPress = () => {
      if (otpMode) {
        setOtpMode(false);
        setOtp(['', '', '', '', '', '']);
        return true;
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [otpMode]);

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
      console.error('[AUTH] Firebase Send OTP failed:', error);
      setLoading(false);
      
      let errMsg = 'Failed to send OTP via SMS. Please check your mobile number and internet connection.';
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
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    if (text.length === 1 && index < 5) {
      otpRefs[index + 1].current?.focus();
    }
    if (text.length === 1 && index === 5) {
      Keyboard.dismiss();
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      otpRefs[index - 1].current?.focus();
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
      const firebaseUser = await confirmation.confirm(otpString);
      const userObj = firebaseUser?.user || firebaseUser;
      if (userObj && typeof userObj.getIdToken === 'function') {
        firebaseIdToken = await userObj.getIdToken(true);
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

    // Phone from Firebase (strip +91 for backend lookup)
    const verifiedPhone = (firebasePhone || `+91${cleanPhone}`).replace(/^\+91/, '');

    let data: any = null;
    try {
      data = await verifyFirebaseOtp(
        firebaseIdToken,
        isRegisterMode ? 'signup' : 'login',
        isRegisterMode ? fullName : undefined,
        'driver'
      );
      console.log('[AUTH] Backend verify-otp response:', JSON.stringify(data));
    } catch (apiErr: any) {
      console.warn('verifyFirebaseOtp call notice:', apiErr);
    }

    const token = (data && data.success && (data.accessToken || data.token))
      ? (data.accessToken || data.token)
      : firebaseIdToken;

    // Completely wipe any previous session to guarantee 100% multi-user isolation
    await AsyncStorage.clear();

    await AsyncStorage.setItem('userToken', cleanPhone || phone);
    await AsyncStorage.setItem('authToken', token);
    if (firebasePhone) await AsyncStorage.setItem('firebasePhone', firebasePhone);
    if (firebaseUid) await AsyncStorage.setItem('firebaseUid', firebaseUid);

    if (selectedRole === 'admin') {
      setLoading(false);
      navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
      return;
    }

    // Look up driver by phone first (most reliable — backend ignores Firebase token context)
    let driverDb: any = null;
    try {
      driverDb = await getDriverProfileByPhone(cleanPhone || phone);
      console.log('[AUTH] Driver by phone lookup:', driverDb ? 'FOUND' : 'NOT FOUND');
      if (!driverDb) {
        driverDb = await getDriverProfile(token);
        console.log('[AUTH] Driver by token lookup:', driverDb ? 'FOUND' : 'NOT FOUND');
      }
    } catch (e) {
      console.warn('Driver profile fetch notice:', e);
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

      if (normalizedKyc === 'rejected') {
        navigation.navigate('DriverRegistration', { mobile: profileData.mobile, firebaseIdToken, fullName: profileData.fullName });
      } else if (normalizedKyc === 'pending') {
        navigation.reset({ index: 0, routes: [{ name: 'ApprovalPending' }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'DriverTabs' }] });
      }
    } else {
      // Driver profile not found on backend — navigate to Registration to complete KYC profile
      setLoading(false);
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
                  <Text style={styles.inputLabel}>Enter OTP</Text>
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
                      maxLength={1}
                      value={digit}
                      onChangeText={(text) => handleOtpChange(text, index)}
                      onKeyPress={(e) => handleKeyPress(e, index)}
                      onFocus={() => setFocusedInput(`otp${index}`)}
                      onBlur={() => setFocusedInput(null)}
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
  countryCodeBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  flagText: { fontSize: 18, marginRight: 6 },
  countryCodeText: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  inputDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0', marginRight: 12 },
  inputField: { flex: 1, fontSize: 15, fontWeight: '500', color: '#0F172A', height: '100%' },
  
  shieldRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  shieldText: { fontSize: 12, color: '#64748B', fontWeight: '500', marginLeft: 6 },

  otpSection: { marginTop: 16 },
  otpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  timerText: { fontSize: 13, fontWeight: '700', color: '#0052FF' },
  otpBoxesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  otpBox: {
    width: 45, height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF', textAlign: 'center', fontSize: 20, fontWeight: '700', color: '#0F172A',
  },
  otpBoxFocused: { borderColor: '#0052FF' },
  otpBoxFilled: { backgroundColor: '#F8FAFC' },
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
});

export default LoginScreen;
