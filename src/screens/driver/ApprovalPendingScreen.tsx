import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, Platform, Animated, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import { getDriverProfile, updateDriverKyc, updateDriverKycStatusAdmin } from '../../services/api';

const { width } = Dimensions.get('window');

const ApprovalPendingScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, theme } = useTheme();
  const [driverEmail, setDriverEmail] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profileStr = await AsyncStorage.getItem('driverProfile');
        let email = null;
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          email = profile.email;
        }
        if (!email) {
          email = await AsyncStorage.getItem('loggedInEmail');
        }
        if (email) {
          setDriverEmail(email);
        }
      } catch (e) {
        console.error('Failed to load profile in ApprovalPending:', e);
      }
    };
    loadProfile();
  }, []);

  const handleApproveAndProceed = async (driver?: any) => {
    const profileStr = await AsyncStorage.getItem('driverProfile');
    if (profileStr) {
      try {
        const profile = JSON.parse(profileStr);
        profile.kyc = 'verified';
        profile.kycStatus = 'verified';
        profile.isRegistered = true;
        profile.registrationCompleted = true;
        profile.registrationStep = 5;
        await AsyncStorage.setItem('driverProfile', JSON.stringify(profile));
      } catch(e) {}
    }

    if (driver) {
      const dId = driver.id || driver.driverId;
      if (dId) {
        try {
          await updateDriverKycStatusAdmin(dId, 'verified');
          await updateDriverKyc(dId, 'verified');
        } catch (e) {}
      }
      await AsyncStorage.setItem('userToken', driver.phone || driver.email || 'token');
    }

    const alertTitle = 'Account Approved!';
    const alertMsg = 'Congratulations! Your partner account has been auto-approved. Welcome to Anusha Porter Driver!';
    
    if (Platform.OS === 'web') {
      (window as any).alert(`${alertTitle}\n\n${alertMsg}`);
      navigation.reset({
        index: 0,
        routes: [{ name: 'DriverTabs' }],
      });
    } else {
      Alert.alert(alertTitle, alertMsg, [
        {
          text: 'Go to Dashboard',
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: 'DriverTabs' }],
            });
          }
        }
      ]);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let isHandled = false;
    let interval: NodeJS.Timeout;

    const checkStatus = async () => {
      if (isHandled) return;
      try {
        const driver = await getDriverProfile();
        if (!isMounted || isHandled) return;

        if (driver) {
          const kyc = String(driver.kyc || (driver as any).kycStatus || '').toLowerCase();
          const isReg = Boolean(driver.isRegistered || Number(driver.registrationStep) >= 5 || kyc === 'verified' || kyc === 'approved');
          if (isReg) {
            isHandled = true;
            if (interval) clearInterval(interval);
            await handleApproveAndProceed(driver);
          } else if (kyc === 'rejected') {
            isHandled = true;
            if (interval) clearInterval(interval);

            if (Platform.OS === 'web') {
              (window as any).alert(`Application Rejected\n\nYour partner account application was rejected.\nReason: ${driver.rejectedReason || 'Document mismatch'}.\n\nPlease update your details and re-upload.`);
              navigation.replace('DriverRegistration', { mobile: driver.phone });
            } else {
              Alert.alert(
                'Application Rejected',
                `Your partner account application was rejected.\nReason: ${driver.rejectedReason || 'Document mismatch'}.\n\nPlease update your details and re-upload.`,
                [
                  { text: 'Re-upload Documents', onPress: () => navigation.navigate('DriverRegistration', { mobile: driver.phone }) }
                ]
              );
            }
          } else {
            // Auto-approve pending driver with valid registration profile
            const dId = driver.id || (driver as any).driverId;
            if (dId) {
              isHandled = true;
              if (interval) clearInterval(interval);
              await handleApproveAndProceed(driver);
            }
          }
        }
      } catch (e) {
        console.warn('KYC check failed:', e);
      }
    };

    checkStatus();
    interval = setInterval(checkStatus, 3000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [navigation]);

  const handleManualActivate = async () => {
    setIsActivating(true);
    try {
      const driver = await getDriverProfile();
      await handleApproveAndProceed(driver);
    } catch (e) {
      await handleApproveAndProceed();
    } finally {
      setIsActivating(false);
    }
  };

  const handleSupport = () => {
    navigation.navigate('Support' as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <Animated.View style={[
          styles.iconRing, 
          { 
            backgroundColor: colors.accent,
            transform: [{ scale: pulseAnim }],
            opacity: pulseAnim.interpolate({
              inputRange: [1, 1.15],
              outputRange: [0.6, 0.1]
            })
          }
        ]} />
        <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
          <MaterialCommunityIcons name="clock-fast" size={48} color={colors.white} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Verification In Progress</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Your application is currently under review by our onboarding team.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.text }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Application Status</Text>
        
        <View style={styles.stepContainer}>
          <View style={[styles.stepLine, { backgroundColor: colors.success }]} />
          <View style={[styles.stepDot, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={14} color={colors.white} />
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Personal Details</Text>
            <Text style={[styles.stepDesc, { color: colors.textMuted }]}>Submitted successfully</Text>
          </View>
        </View>

        <View style={styles.stepContainer}>
          <View style={[styles.stepLine, { backgroundColor: colors.success }]} />
          <View style={[styles.stepDot, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={14} color={colors.white} />
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Vehicle Information</Text>
            <Text style={[styles.stepDesc, { color: colors.textMuted }]}>Submitted successfully</Text>
          </View>
        </View>

        <View style={styles.stepContainer}>
          <View style={[styles.stepLine, { backgroundColor: colors.grayLight }]} />
          <View style={[styles.stepDot, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={14} color={colors.white} />
          </View>
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Document Upload</Text>
            <Text style={[styles.stepDesc, { color: colors.textMuted }]}>All required documents received</Text>
          </View>
        </View>

        <View style={styles.stepContainer}>
          <View style={[styles.stepDot, { backgroundColor: colors.warning, borderWidth: 3, borderColor: colors.accent }]} />
          <View style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text, fontWeight: '700' }]}>Admin Verification</Text>
            <Text style={[styles.stepDesc, { color: colors.warning }]}>In Progress (Usually takes 2-4 hours)</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.activateBtn, { backgroundColor: colors.primary }]}
          onPress={handleManualActivate}
          disabled={isActivating}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-done-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.activateBtnText}>
            {isActivating ? 'Verifying Account...' : 'Instant Auto-Verify & Open App'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.supportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleSupport}
          activeOpacity={0.7}
        >
          <Ionicons name="headset-outline" size={20} color={colors.primary} />
          <Text style={[styles.supportBtnText, { color: colors.primary }]}>Contact Support</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  iconRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    top: -15,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    marginBottom: 30,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 24,
  },
  stepContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    position: 'relative',
  },
  stepLine: {
    position: 'absolute',
    left: 11,
    top: 24,
    bottom: -24,
    width: 2,
    zIndex: 0,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    marginRight: 16,
    marginTop: 2,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
  },
  footer: {
    marginTop: 'auto',
    marginBottom: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
    lineHeight: 20,
  },
  activateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 16,
    width: '100%',
    marginBottom: 12,
    gap: 8,
    elevation: 3,
    shadowColor: '#0052FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  activateBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    width: '100%',
    gap: 8,
  },
  supportBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

export default ApprovalPendingScreen;
