import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import Colors from '../../theme/colors';

const { width, height } = Dimensions.get('window');

const RoleSelectScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <Text style={styles.logoText}>🚚 PORTER</Text>
        <Text style={styles.headerTitle}>Welcome Back!</Text>
        <Text style={styles.headerSubtitle}>Choose how you want to continue</Text>
      </View>

      <View style={styles.cardsContainer}>
        {/* Driver Card */}
        <TouchableOpacity
          style={[styles.roleCard, styles.driverCard]}
          onPress={() => navigation.navigate('Login', { role: 'driver' })}
          activeOpacity={0.9}
        >
          <View style={styles.cardGlow} />
          <View style={styles.cardIconContainer}>
            <Text style={styles.cardIcon}>🏍️</Text>
          </View>
          <Text style={styles.cardTitle}>Delivery Partner</Text>
          <Text style={styles.cardSubtitle}>Accept orders & earn money</Text>
          <View style={styles.cardFeatures}>
            <Text style={styles.feature}>✓ Real-time orders</Text>
            <Text style={styles.feature}>✓ Live earnings</Text>
            <Text style={styles.feature}>✓ Route navigation</Text>
          </View>
          <View style={styles.cardButton}>
            <Text style={styles.cardButtonText}>Login as Driver →</Text>
          </View>
        </TouchableOpacity>

        {/* Admin Card */}
        <TouchableOpacity
          style={[styles.roleCard, styles.adminCard]}
          onPress={() => navigation.navigate('Login', { role: 'admin' })}
          activeOpacity={0.9}
        >
          <View style={[styles.cardGlow, { backgroundColor: Colors.info }]} />
          <View style={[styles.cardIconContainer, { backgroundColor: 'rgba(52,152,219,0.2)' }]}>
            <Text style={styles.cardIcon}>🛡️</Text>
          </View>
          <Text style={styles.cardTitle}>Admin Panel</Text>
          <Text style={styles.cardSubtitle}>Manage the entire platform</Text>
          <View style={styles.cardFeatures}>
            <Text style={styles.feature}>✓ Order management</Text>
            <Text style={styles.feature}>✓ Driver control</Text>
            <Text style={styles.feature}>✓ Analytics</Text>
          </View>
          <View style={[styles.cardButton, { backgroundColor: Colors.info }]}>
            <Text style={styles.cardButtonText}>Admin Login →</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* New Driver */}
      <TouchableOpacity
        style={styles.registerLink}
        onPress={() => navigation.navigate('DriverRegistration')}
      >
        <Text style={styles.registerText}>New driver? </Text>
        <Text style={styles.registerTextBold}>Register here →</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.white,
    letterSpacing: 4,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  cardsContainer: {
    flex: 1,
    gap: 16,
    paddingTop: 10,
  },
  roleCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.primary,
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
    backgroundColor: Colors.primary,
    opacity: 0.15,
  },
  cardIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,107,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardIcon: {
    fontSize: 32,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  cardFeatures: {
    gap: 6,
    marginBottom: 20,
  },
  feature: {
    color: Colors.success,
    fontSize: 13,
    fontWeight: '500',
  },
  cardButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cardButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  registerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  registerText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  registerTextBold: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default RoleSelectScreen;
