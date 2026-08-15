import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeContext';

const { width, height } = Dimensions.get('window');

const RoleSelectScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            <Image 
              source={require('../../../assets/splash-icon.png')} 
              style={{ width: '100%', height: '100%' }} 
              resizeMode="contain"
            />
          </View>
          <Text style={[styles.logoText, { color: colors.text, marginBottom: 0 }]}>ANUSHA PORTER DRIVER</Text>
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Welcome Back!</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Choose how you want to continue</Text>
      </View>

      <View style={styles.cardsContainer}>
        {/* Driver Card */}
        <TouchableOpacity
          style={[styles.roleCard, styles.driverCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.primary }]}
          onPress={() => navigation.navigate('Login', { role: 'driver' })}
          activeOpacity={0.9}
        >
          <View style={[styles.cardGlow, { backgroundColor: colors.primary }]} />
          <View style={[styles.cardIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(0,82,255,0.2)' : 'rgba(0,82,255,0.08)' }]}>
            <MaterialCommunityIcons name="bike" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Delivery Partner</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Accept orders & earn money</Text>
          <View style={styles.cardFeatures}>
            <Text style={[styles.feature, { color: colors.success }]}>✓ Real-time orders</Text>
            <Text style={[styles.feature, { color: colors.success }]}>✓ Live earnings</Text>
            <Text style={[styles.feature, { color: colors.success }]}>✓ Route navigation</Text>
          </View>
          <View style={[styles.cardButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.cardButtonText, { color: '#FFFFFF' }]}>Login as Driver →</Text>
          </View>
        </TouchableOpacity>

        {/* Admin Card */}
        <TouchableOpacity
          style={[styles.roleCard, styles.adminCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.info }]}
          onPress={() => navigation.navigate('Login', { role: 'admin' })}
          activeOpacity={0.9}
        >
          <View style={[styles.cardGlow, { backgroundColor: colors.info }]} />
          <View style={[styles.cardIconContainer, { backgroundColor: theme === 'dark' ? 'rgba(52,152,219,0.2)' : 'rgba(52,152,219,0.08)' }]}>
            <MaterialCommunityIcons name="shield-account-outline" size={32} color={colors.info} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Admin Panel</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Manage the entire platform</Text>
          <View style={styles.cardFeatures}>
            <Text style={[styles.feature, { color: colors.success }]}>✓ Order management</Text>
            <Text style={[styles.feature, { color: colors.success }]}>✓ Driver control</Text>
            <Text style={[styles.feature, { color: colors.success }]}>✓ Analytics</Text>
          </View>
          <View style={[styles.cardButton, { backgroundColor: colors.info }]}>
            <Text style={[styles.cardButtonText, { color: '#FFFFFF' }]}>Admin Login →</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* New Driver */}
      <TouchableOpacity
        style={styles.registerLink}
        onPress={() => navigation.navigate('Login', { role: 'driver' })}
      >
        <Text style={[styles.registerText, { color: colors.textSecondary }]}>New driver? </Text>
        <Text style={[styles.registerTextBold, { color: colors.primary }]}>Register here →</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 70,
    paddingBottom: 30,
    alignItems: 'center',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
  },
  cardsContainer: {
    flex: 1,
    gap: 16,
    paddingTop: 10,
  },
  roleCard: {
    flex: 1,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  driverCard: {},
  adminCard: {},
  cardGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.15,
  },
  cardIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  cardFeatures: {
    gap: 6,
    marginBottom: 20,
  },
  feature: {
    fontSize: 13,
    fontWeight: '500',
  },
  cardButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cardButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  registerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  registerText: {
    fontSize: 14,
  },
  registerTextBold: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default RoleSelectScreen;
