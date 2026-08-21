import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { getAdminWalletSettings, saveAdminWalletSettings, AdminWalletSettings } from '../../services/api';

const WalletSettingsScreen = () => {
  const navigation = useNavigation();
  const { colors, theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [commissionInput, setCommissionInput] = useState('5');
  const [minBalanceInput, setMinBalanceInput] = useState('0');
  const [walletRequired, setWalletRequired] = useState(true);
  const [autoOffline, setAutoOffline] = useState(true);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminWalletSettings();
      if (res && res.settings) {
        setCommissionInput(String(res.settings.commissionPercentage ?? 5));
        setMinBalanceInput(String(res.settings.minRequiredBalance ?? 0));
        setWalletRequired(!!res.settings.walletRequiredForRides);
        setAutoOffline(!!res.settings.autoOfflineWhenBalanceInsufficient);
      }
    } catch (e) {
      console.warn('Failed to load wallet settings:', e);
      Alert.alert('Load Notice', 'Could not load saved settings from backend. Using current defaults.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (saving) return;

    const commNum = parseFloat(commissionInput.trim());
    if (isNaN(commNum) || commNum < 0 || commNum > 100) {
      Alert.alert('Invalid Commission', 'Please enter a valid commission percentage between 0% and 100%.');
      return;
    }

    const minBalNum = parseFloat(minBalanceInput.trim());
    if (isNaN(minBalNum) || minBalNum < 0) {
      Alert.alert('Invalid Balance', 'Please enter a valid minimum balance threshold (0 or higher).');
      return;
    }

    setSaving(true);
    try {
      const payload: AdminWalletSettings = {
        commissionPercentage: commNum,
        minRequiredBalance: minBalNum,
        walletRequiredForRides: walletRequired,
        autoOfflineWhenBalanceInsufficient: autoOffline,
      };

      const res = await saveAdminWalletSettings(payload);
      if (res && res.success) {
        Alert.alert(
          'Settings Saved 🎉',
          `Driver Wallet Settings updated successfully.\n\nCommission: ${commNum}%\nMinimum Balance: ₹${minBalNum}\nWallet Required: ${walletRequired ? 'ON' : 'OFF'}\nAuto-Offline: ${autoOffline ? 'ON' : 'OFF'}`
        );
      } else {
        Alert.alert('Save Failed', res?.message || 'Could not update settings on the server.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Network error while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Driver Wallet Settings</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Configure Commission & Eligibility</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadSettings} disabled={loading || saving}>
          <Ionicons name="refresh-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading configuration...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Information Card */}
          <View style={[styles.infoBanner, { backgroundColor: theme === 'dark' ? 'rgba(0, 82, 255, 0.15)' : 'rgba(0, 82, 255, 0.08)', borderColor: colors.border }]}>
            <Ionicons name="information-circle" size={24} color={colors.primary} />
            <Text style={[styles.infoBannerText, { color: colors.textSecondary }]}>
              These settings dynamically control driver ride eligibility, automatic offline thresholds, and per-ride commission deductions across the platform.
            </Text>
          </View>

          {/* Form Card */}
          <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Commission Percentage */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Ionicons name="pie-chart-outline" size={18} color={colors.primary} />
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Commission Percentage (%)</Text>
              </View>
              <Text style={[styles.fieldDesc, { color: colors.textMuted }]}>
                Percentage deducted from driver's wallet upon completion of each ride.
              </Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  keyboardType="numeric"
                  value={commissionInput}
                  onChangeText={setCommissionInput}
                  placeholder="5"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={[styles.inputSuffix, { color: colors.textMuted }]}>%</Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Minimum Required Wallet Balance */}
            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Ionicons name="wallet-outline" size={18} color={colors.success} />
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Minimum Required Wallet Balance (₹)</Text>
              </View>
              <Text style={[styles.fieldDesc, { color: colors.textMuted }]}>
                Minimum operational wallet balance required for drivers to be eligible for rides.
              </Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.inputPrefix, { color: colors.text }]}>₹</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  keyboardType="numeric"
                  value={minBalanceInput}
                  onChangeText={setMinBalanceInput}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Wallet Required For Rides Toggle */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={styles.labelRow}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} />
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Wallet Required For Rides</Text>
                </View>
                <Text style={[styles.fieldDesc, { color: colors.textMuted }]}>
                  Enforce wallet balance check before dispatching incoming rides to drivers.
                </Text>
              </View>
              <Switch
                value={walletRequired}
                onValueChange={setWalletRequired}
                trackColor={{ false: colors.surface, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Auto Offline When Balance Is Insufficient Toggle */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={styles.labelRow}>
                  <Ionicons name="power-outline" size={18} color={colors.error} />
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Auto Offline When Insufficient</Text>
                </View>
                <Text style={[styles.fieldDesc, { color: colors.textMuted }]}>
                  Automatically switch drivers offline if balance drops below threshold after commission deduction.
                </Text>
              </View>
              <Switch
                value={autoOffline}
                onValueChange={setAutoOffline}
                trackColor={{ false: colors.surface, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <View style={styles.saveBtnContent}>
                <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>SAVE SETTINGS</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </View>
  );
};

export default WalletSettingsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 6,
  },
  headerTitleBox: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  refreshBtn: {
    padding: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  formCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  fieldDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    marginTop: 6,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  inputSuffix: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  saveBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

