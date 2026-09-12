import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

const { width } = Dimensions.get('window');

export type InAppUpdateModalMode = 'available' | 'downloading' | 'downloaded';

interface InAppUpdateModalProps {
  visible: boolean;
  mode?: InAppUpdateModalMode;
  allowLater?: boolean;
  onUpdateNow: () => void;
  onLater: () => void;
}

export const InAppUpdateModal: React.FC<InAppUpdateModalProps> = ({
  visible,
  mode = 'available',
  allowLater = true,
  onUpdateNow,
  onLater,
}) => {
  const { colors } = useTheme();

  if (!visible) return null;

  const isDownloaded = mode === 'downloaded';
  const isDownloading = mode === 'downloading';

  const title = isDownloaded
    ? 'Update Ready to Install'
    : isDownloading
    ? 'Downloading Update...'
    : 'New Update Available';

  const message = isDownloaded
    ? 'The latest update has been downloaded. Restart the app now to apply the new improvements and features.'
    : isDownloading
    ? 'You can continue using the app while the update downloads in the background.'
    : 'A new version of the app is available on Google Play. Update now to get the latest improvements, fixes, and features.';

  const primaryBtnText = isDownloaded ? 'Restart Now' : 'Update on Play Store';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {/* Top Icon Badge */}
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: isDownloaded
                  ? '#10B98122'
                  : `${colors.primary}22`,
              },
            ]}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name={isDownloaded ? 'checkmark-circle' : 'sparkles'}
                size={32}
                color={isDownloaded ? '#10B981' : colors.primary}
              />
            )}
          </View>

          {/* Title & Message */}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {!isDownloading && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={onUpdateNow}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isDownloaded ? 'refresh-outline' : 'cloud-download-outline'}
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryBtnText}>{primaryBtnText}</Text>
              </TouchableOpacity>
            )}

            {allowLater && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={onLater}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.textMuted }]}>
                  {isDownloading ? 'Continue Using App' : 'Later'}
                </Text>
              </TouchableOpacity>
            )}
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
    paddingHorizontal: 24,
  },
  card: {
    width: Math.min(width - 48, 380),
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    width: '100%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
