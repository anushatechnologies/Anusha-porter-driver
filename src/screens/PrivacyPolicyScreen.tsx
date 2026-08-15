import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export const PrivacyPolicyScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Navigation Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.appName, { color: colors.primary }]}>Anusha Porter Driver</Text>
          <Text style={[styles.companyName, { color: colors.textSecondary }]}>
            Developer: Anusha Bazaar Technologies Pvt. Ltd.
          </Text>
          <Text style={[styles.lastUpdated, { color: colors.textMuted }]}>
            Effective Date: August 10, 2026
          </Text>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Section 1: Overview */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>1. Overview & Commitment</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Anusha Bazaar Technologies Pvt. Ltd. ("we", "our", or "us") operates the{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>Anusha Porter Driver</Text> mobile application. 
            This Privacy Policy describes how we collect, use, transmit, and protect your information when you use our driver mobile application to deliver logistics and order fulfillment services.
          </Text>

          {/* Section 2: Location Data Collection & Prominent Disclosure */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            2. Location Data Collection & Usage (Foreground & Background)
          </Text>
          <View style={[styles.highlightBox, { backgroundColor: 'rgba(13, 92, 255, 0.08)', borderColor: '#0D5CFF' }]}>
            <Ionicons name="location" size={22} color="#0D5CFF" style={{ marginBottom: 6 }} />
            <Text style={[styles.highlightText, { color: colors.text }]}>
              Anusha Porter Driver collects location data to enable real-time driver tracking and delivery services 
              when the app is in use and when the app is closed or not in use (background location tracking).
            </Text>
          </View>

          <Text style={[styles.subTitle, { color: colors.text }]}>Why Location Data is Collected:</Text>
          <View style={styles.bulletPoint}>
            <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '700', color: colors.text }}>Real-Time Driver Tracking:</Text> To display your live position on the logistics dispatch map when your status is set to "ONLINE".
            </Text>
          </View>
          <View style={styles.bulletPoint}>
            <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '700', color: colors.text }}>Delivery & Order Coordination:</Text> To calculate optimal delivery routes, match nearby delivery orders to you, and inform customers of real-time pickup and drop-off ETAs.
            </Text>
          </View>
          <View style={styles.bulletPoint}>
            <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '700', color: colors.text }}>Background Location Access:</Text> Location data is collected while the app is running in the background or when the phone screen is turned off during an active driver duty session. This ensures uninterrupted route tracking even when you navigate using third-party maps (such as Google Maps).
            </Text>
          </View>

          {/* Section 3: Data Transmission & Backend Hosting */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>3. Data Transmission & Backend Handling</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            Location coordinates (latitude, longitude, and heading) captured by the device are encrypted using SSL/TLS HTTPS standard protocols and transmitted securely to our central server endpoint (<Text style={{ fontFamily: 'monospace' }}>/api/drivers/me/location</Text>).
          </Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            We do NOT sell, rent, or share your real-time or historical location data with third-party advertisers, data brokers, or marketing networks. Location access is strictly limited to core logistics execution and dispatch operations.
          </Text>

          {/* Section 4: Other Information We Collect */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Information We Collect</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            In addition to location data, we collect:
          </Text>
          <Text style={[styles.bulletText, { color: colors.textSecondary, marginBottom: 4 }]}>
            • Driver Identity & Profile Information (Name, phone number, vehicle registration number, driving license, KYC documents).
          </Text>
          <Text style={[styles.bulletText, { color: colors.textSecondary, marginBottom: 4 }]}>
            • Device Information (Device model, OS version, push notification token for order alerts).
          </Text>
          <Text style={[styles.bulletText, { color: colors.textSecondary, marginBottom: 12 }]}>
            • Trip & Order Logs (Earnings records, completed delivery status, timestamp history).
          </Text>

          {/* Section 5: Driver Controls & Disabling Tracking */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>5. User Choice & Controlling Location Tracking</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            You have full control over location tracking:
          </Text>
          <View style={styles.bulletPoint}>
            <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '700', color: colors.text }}>Going Offline:</Text> Toggling your status switch to "OFFLINE" on the Driver Dashboard immediately stops active location updates.
            </Text>
          </View>
          <View style={styles.bulletPoint}>
            <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
            <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '700', color: colors.text }}>System Settings:</Text> You can adjust or revoke location permissions at any time via Android System Settings {'>'} Apps {'>'} Anusha Porter Driver {'>'} Permissions. Please note that location permissions are required to go online and receive delivery jobs.
            </Text>
          </View>

          {/* Section 6: Retention & Security */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>6. Data Retention & Security</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            We maintain strict security safeguards to protect your personal information against unauthorized access, loss, or alteration. Location logs are retained only as required for order history auditing, payout verification, and dispute resolution.
          </Text>

          {/* Section 7: Contact Us */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>7. Contact Us</Text>
          <Text style={[styles.paragraph, { color: colors.textSecondary }]}>
            If you have any questions or concerns regarding this Privacy Policy or location data practices, please contact us:
          </Text>
          <Text style={[styles.contactInfo, { color: colors.text }]}>
            Anusha Bazaar Technologies Pvt. Ltd.{'\n'}
            Email: support@anusha.com{'\n'}
            App: Anusha Porter Driver
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  companyName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  lastUpdated: {
    fontSize: 12,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  highlightBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 10,
  },
  highlightText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  bulletPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 16,
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  contactInfo: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 6,
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 12,
    borderRadius: 8,
  },
});

export default PrivacyPolicyScreen;
