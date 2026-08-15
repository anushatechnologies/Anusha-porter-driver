import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

interface LocationDisclosureModalProps {
  visible: boolean;
  onContinue: () => void;
  onNotNow: () => void;
  onOpenPrivacyPolicy?: () => void;
}

const { width } = Dimensions.get('window');

export const LocationDisclosureModal: React.FC<LocationDisclosureModalProps> = ({
  visible,
  onContinue,
  onNotNow,
  onOpenPrivacyPolicy,
}) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onNotNow}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.dialogContainer,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Header Icon */}
          <View style={styles.headerIconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="location" size={32} color="#0D5CFF" />
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>Location Access</Text>

          {/* Disclosure Content */}
          <ScrollView
            style={styles.scrollArea}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={[styles.mainDescription, { color: colors.text }]}>
              <Text style={{ fontWeight: '700' }}>Anusha Porter Driver</Text> collects
              location data to enable real-time driver tracking and delivery services
              when the app is in use and when the app is closed or not in use.
            </Text>

            <Text style={[styles.subHeading, { color: colors.text }]}>
              Your location is used to:
            </Text>

            <View style={styles.bulletList}>
              <View style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={18} color="#00C896" style={styles.bulletIcon} />
                <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                  Share your current location during active delivery/driver service.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={18} color="#00C896" style={styles.bulletIcon} />
                <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                  Help provide real-time driver tracking to customers & dispatchers.
                </Text>
              </View>

              <View style={styles.bulletRow}>
                <Ionicons name="checkmark-circle" size={18} color="#00C896" style={styles.bulletIcon} />
                <Text style={[styles.bulletText, { color: colors.textSecondary }]}>
                  Support delivery coordination and order assignment services.
                </Text>
              </View>
            </View>

            <Text style={[styles.transmissionNote, { color: colors.textSecondary }]}>
              Location data may be transmitted to Anusha Porter systems to provide these driver and delivery features.
            </Text>

            <Text style={[styles.promptText, { color: colors.text }]}>
              Please allow location access to use real-time driver services.
            </Text>

            {onOpenPrivacyPolicy && (
              <TouchableOpacity
                onPress={onOpenPrivacyPolicy}
                style={styles.privacyLinkBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color="#0D5CFF" />
                <Text style={styles.privacyLinkText}>Read full Privacy Policy</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnNotNow, { borderColor: colors.border }]}
              onPress={onNotNow}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnNotNowText, { color: colors.textSecondary }]}>Not Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnContinue]}
              onPress={onContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.btnContinueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dialogContainer: {
    width: Math.min(width - 40, 420),
    maxHeight: '85%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  headerIconContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(13, 92, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  scrollArea: {
    maxHeight: 340,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  mainDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  subHeading: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  bulletList: {
    marginBottom: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bulletIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  bulletText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  transmissionNote: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  promptText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 14,
  },
  privacyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  privacyLinkText: {
    fontSize: 13,
    color: '#0D5CFF',
    fontWeight: '600',
    marginLeft: 6,
    textDecorationLine: 'underline',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnNotNow: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  btnNotNowText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnContinue: {
    backgroundColor: '#0D5CFF',
  },
  btnContinueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default LocationDisclosureModal;
