import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  TextInput,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';

import { getAllDrivers, updateDriverKyc, deleteDriver } from '../../services/api';
import { cleanUrl } from '../../utils/urlHelpers';

const { width, height } = Dimensions.get('window');

const DriverManagementScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, theme } = useTheme();
  
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'verified' | 'pending' | 'rejected'>('all');
  
  // Selected driver for detailed document review modal
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fullscreen document preview state
  const [previewDoc, setPreviewDoc] = useState<{ label: string; uri: string } | null>(null);

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const list = await getAllDrivers(filter === 'all' ? undefined : filter);
      setDrivers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn('Failed to load drivers:', e);
      Alert.alert('Network Error', 'Could not retrieve drivers from the backend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, [filter]);

  const handleUpdateKyc = async (driver: any, newStatus: 'verified' | 'pending' | 'rejected') => {
    if (newStatus === 'pending') return;
    if (newStatus === 'rejected' && !rejectReason.trim()) {
      Alert.alert('Reason Required', 'Please enter a rejection reason for the driver.');
      return;
    }

    setActionLoading(true);
    try {
      const driverId = driver.id || driver.driverId;
      const success = await updateDriverKyc(driverId, newStatus, rejectReason);

      if (success) {
        Alert.alert('Success', `Driver KYC status updated to ${newStatus.toUpperCase()}.`);
        setSelectedDriver(null);
        setRejectReason('');
        fetchDrivers();
      } else {
        Alert.alert('Error', 'Failed to update KYC status on backend.');
      }
    } catch (e) {
      console.warn('Error updating driver status:', e);
      Alert.alert('Connection Error', 'Failed to submit updates to the server.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDriver = (driver: any) => {
    const driverId = driver.driverId || driver.id;
    const driverName = driver.name || 'this driver';
    Alert.alert(
      'Delete Driver Profile',
      `Are you sure you want to permanently remove driver "${driverName}" (ID: ${driverId})? This will also remove their uploaded documents from the server.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(String(driverId));
            try {
              const res = await deleteDriver(driverId);
              if (res.success) {
                Alert.alert('Success', 'Driver profile removed successfully.');
                if (selectedDriver && (selectedDriver.id === driverId || selectedDriver.driverId === driverId)) {
                  setSelectedDriver(null);
                }
                fetchDrivers();
              } else {
                Alert.alert('Error', res.message || 'Failed to remove driver profile.');
              }
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to remove driver profile.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const safeDrivers = Array.isArray(drivers) ? drivers : [];
  const filtered = safeDrivers.filter(d => {
    if (!d) return false;
    const matchesSearch = 
      (d.name || '').toLowerCase().includes(search.toLowerCase()) || 
      (d.phone || '').includes(search) || 
      (d.email || '').toLowerCase().includes(search.toLowerCase());
    
    const dKyc = String(d.kyc || d.kycStatus || 'pending').toLowerCase();
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'verified' ? (dKyc === 'verified' || dKyc === 'approved') : dKyc === filter);
    
    return matchesSearch && matchesFilter;
  });

  const kycColors: Record<string, string> = {
    verified: colors.success,
    approved: colors.success,
    pending: colors.warning,
    rejected: colors.error,
  };

  const isDark = theme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>KYC Verifications</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>{filtered.length} drivers</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search partner by name, email or phone..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'verified', 'rejected'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              filter === f && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, { color: colors.textSecondary }, filter === f && { color: '#FFFFFF' }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textSecondary }}>Fetching verification queue...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>No verification requests found</Text>
            </View>
          ) : (
            filtered.map((driver, index) => {
              const driverKey = String(driver.id || driver.driverId || (driver as any)._id || index);
              const kycRaw = String(driver.kyc || driver.kycStatus || 'pending').toLowerCase();
              const badgeColor = kycColors[kycRaw] || colors.warning;
              return (
                <TouchableOpacity
                  key={driverKey}
                  style={[styles.driverCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={() => setSelectedDriver(driver)}
                >
                  <View style={styles.driverTop}>
                    <View style={[styles.avatarBox, { backgroundColor: colors.cardLight }]}>
                      {driver.profilePhotoUri || driver.documents?.profilePhotoUrl ? (
                        <Image source={{ uri: cleanUrl(driver.profilePhotoUri || driver.documents?.profilePhotoUrl) }} style={styles.avatarImg} />
                      ) : (
                        <Ionicons name="person" size={20} color={colors.primary} />
                      )}
                    </View>
                    <View style={styles.driverInfo}>
                      <Text style={[styles.driverName, { color: colors.text }]}>{driver.name || 'Anonymous Partner'}</Text>
                      <Text style={[styles.driverSub, { color: colors.textSecondary }]}>{driver.phone || '—'} • {driver.email || '—'}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <View style={{ backgroundColor: 'rgba(0, 82, 255, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                            {driver.vehicleType || driver.vehicle || driver.vehicle_type || 'Unspecified'}
                          </Text>
                        </View>
                        {driver.vehicleNumber ? (
                          <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                            ({driver.vehicleNumber})
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={[styles.kycBadge, { backgroundColor: `${badgeColor}20` }]}>
                      <Text style={[styles.kycText, { color: badgeColor }]}>
                        {kycRaw.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
                <View style={styles.cardFooter}>
                  <Text style={[styles.docCountText, { color: colors.textMuted }]}>
                    <Ionicons name="document-attach-outline" size={12} /> Documents uploaded
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.deleteBtn, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.25)' }]}
                      disabled={deletingId === (driver.id || driver.driverId)}
                      onPress={(e: any) => {
                        e.stopPropagation?.();
                        handleDeleteDriver(driver);
                      }}
                    >
                      {deletingId === (driver.id || driver.driverId) ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <Ionicons name="trash-outline" size={15} color={colors.error} />
                      )}
                    </TouchableOpacity>
                    <View style={styles.actionPrompt}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>REVIEW</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                    </View>
                  </View>
                </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Verification Detailed Review Modal */}
      <Modal visible={!!selectedDriver} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>KYC Document Audit</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setSelectedDriver(null); setRejectReason(''); }}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {selectedDriver && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                {/* Driver basic details */}
                <View style={styles.auditIdentity}>
                  <View style={[styles.auditAvatar, { backgroundColor: colors.cardLight }]}>
                    {selectedDriver.profilePhotoUri || selectedDriver.documents?.profilePhotoUrl ? (
                      <Image source={{ uri: cleanUrl(selectedDriver.profilePhotoUri || selectedDriver.documents?.profilePhotoUrl) }} style={{ width: '100%', height: '100%', borderRadius: 28 }} />
                    ) : (
                      <Ionicons name="person" size={28} color={colors.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.auditName, { color: colors.text }]}>{selectedDriver.name}</Text>
                    <Text style={[styles.auditSub, { color: colors.textSecondary }]}>{selectedDriver.phone} • {selectedDriver.email}</Text>
                    <Text style={[styles.auditSub, { color: colors.textMuted }]}>DOB: {selectedDriver.dob || 'N/A'} • Gender: {selectedDriver.gender || 'N/A'}</Text>
                  </View>
                </View>

                <View style={[styles.cardDivider, { backgroundColor: colors.border, marginVertical: 16 }]} />

                {/* Vehicle & ID details */}
                <Text style={[styles.sectionHeading, { color: colors.text }]}>Vehicle & Identity Numbers</Text>
                <View style={[styles.detailTable, { backgroundColor: colors.cardLight }]}>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Vehicle Type</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>
                      {selectedDriver.vehicleType || (typeof selectedDriver.vehicle === 'string' ? selectedDriver.vehicle : selectedDriver.vehicle?.name || selectedDriver.vehicle?.type) || selectedDriver.vehicle_type || 'Unspecified'}
                    </Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Vehicle Number</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.vehicleNumber || 'N/A'}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>RC Book Number</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.rcNumber || 'N/A'}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>License Number</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.licenseNumber || 'N/A'}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Aadhaar Number</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.aadhaarNumber || 'N/A'}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>PAN Number</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.panNumber || 'N/A'}</Text>
                  </View>
                </View>

                {/* Bank Details */}
                <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 18 }]}>Bank Account Information</Text>
                <View style={[styles.detailTable, { backgroundColor: colors.cardLight }]}>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Bank Name</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.bankName || 'N/A'}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Account Holder</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.accountHolderName || 'N/A'}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Account Number</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.accountNumber || 'N/A'}</Text>
                  </View>
                  <View style={styles.tableRow}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>IFSC Code</Text>
                    <Text style={[styles.rowVal, { color: colors.text }]}>{selectedDriver.ifscCode || 'N/A'}</Text>
                  </View>
                </View>

                {/* Documents Grid */}
                <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 20 }]}>Submitted Verification Photos</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>Tap any document to preview in high resolution</Text>
                <View style={styles.docsGrid}>
                  {[
                    { label: 'Aadhaar Card copy', uri: selectedDriver.aadhaarUri || selectedDriver.aadhaarUrl || selectedDriver.documents?.aadhaarUrl },
                    { label: 'PAN Card copy', uri: selectedDriver.panUri || selectedDriver.panUrl || selectedDriver.documents?.panUrl },
                    { label: 'Driving License copy', uri: selectedDriver.licenseUri || selectedDriver.licenseUrl || selectedDriver.documents?.licenseUrl },
                    { label: 'Registration Certificate (RC)', uri: selectedDriver.rcUri || selectedDriver.rcUrl || selectedDriver.documents?.rcUrl },
                    { label: 'Bank Passbook / Cheque', uri: selectedDriver.bankPassbookUri || selectedDriver.bankPassbookUrl || selectedDriver.documents?.bankPassbookUrl }
                  ].map((doc, idx) => {
                    const resolvedUri = cleanUrl(doc.uri);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.docPreviewCard, { backgroundColor: colors.cardLight, borderColor: colors.border }]}
                        activeOpacity={resolvedUri ? 0.8 : 1}
                        onPress={() => {
                          if (resolvedUri) setPreviewDoc({ label: doc.label, uri: resolvedUri });
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={[styles.docCardLabel, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{doc.label}</Text>
                          {resolvedUri ? <Ionicons name="expand-outline" size={14} color={colors.primary} /> : null}
                        </View>
                        {resolvedUri ? (
                          <Image
                            source={{ uri: resolvedUri }}
                            style={styles.docImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.noDoc}>
                            <Ionicons name="document-outline" size={24} color={colors.textMuted} />
                            <Text style={{ fontSize: 11, color: colors.textMuted }}>No Attachment</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Status action decision panel */}
                <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 24 }]}>Decision & Actions</Text>
                
                <TextInput
                  style={[styles.auditInput, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                  placeholder="Provide rejection reason (e.g. Aadhaar details blur, invalid vehicle plate number)"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                />

                <View style={styles.decisionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.error }]}
                    onPress={() => handleUpdateKyc(selectedDriver, 'rejected')}
                    disabled={actionLoading}
                  >
                    <Ionicons name="close-circle" size={18} color="#FFF" />
                    <Text style={styles.btnLabel}>Reject Document Set</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.success }]}
                    onPress={() => handleUpdateKyc(selectedDriver, 'verified')}
                    disabled={actionLoading}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                    <Text style={styles.btnLabel}>Approve & Verify</Text>
                  </TouchableOpacity>
                </View>

                {/* Permanent Delete Action Button */}
                <TouchableOpacity
                  style={[styles.deleteModalBtn, { borderColor: colors.error, backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}
                  onPress={() => handleDeleteDriver(selectedDriver)}
                  disabled={deletingId === (selectedDriver?.id || selectedDriver?.driverId)}
                >
                  {deletingId === (selectedDriver?.id || selectedDriver?.driverId) ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={{ color: colors.error, fontSize: 13, fontWeight: '700' }}>Permanently Delete Driver Profile</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Fullscreen Document Preview Modal */}
      <Modal visible={!!previewDoc} transparent animationType="fade">
        <View style={styles.previewModalOverlay}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>{previewDoc?.label}</Text>
            <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewDoc(null)}>
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {previewDoc?.uri ? (
            <View style={styles.previewImageContainer}>
              <Image
                source={{ uri: previewDoc.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, paddingBottom: 14, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderStyle: 'solid', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', flex: 1 },
  countBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  countText: { fontSize: 11, fontWeight: '700' },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, marginHorizontal: 20, paddingHorizontal: 14, height: 48, gap: 10, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '500' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontWeight: '600', fontSize: 12 },
  list: { paddingHorizontal: 20, gap: 12, paddingBottom: 30 },
  driverCard: { borderRadius: 18, padding: 14, borderWidth: 1 },
  driverTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatarBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  driverInfo: { flex: 1, gap: 2 },
  driverName: { fontSize: 15, fontWeight: '800' },
  driverSub: { fontSize: 11, fontWeight: '500' },
  vehicleLabel: { fontSize: 11, fontWeight: '500' },
  kycBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  kycText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardDivider: { height: 1, marginVertical: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docCountText: { fontSize: 11, fontWeight: '500' },
  actionPrompt: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { height: height * 0.88, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1.5, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalScroll: { paddingBottom: 40 },
  auditIdentity: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  auditAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  auditName: { fontSize: 18, fontWeight: '800' },
  auditSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  sectionHeading: { fontSize: 14, fontWeight: '800', marginBottom: 10, letterSpacing: 0.3 },
  detailTable: { borderRadius: 16, padding: 12, gap: 10 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 12, fontWeight: '500' },
  rowVal: { fontSize: 12, fontWeight: '700' },
  docsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  docPreviewCard: { width: '48%', borderRadius: 14, borderWidth: 1, padding: 8, gap: 8 },
  docCardLabel: { fontSize: 11, fontWeight: '600' },
  docImage: { width: '100%', height: 120, borderRadius: 10, backgroundColor: '#FFF' },
  noDoc: { width: '100%', height: 120, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#CBD5E1' },
  auditInput: { borderRadius: 14, borderWidth: 1, padding: 12, fontSize: 12, fontWeight: '500', height: 70, textAlignVertical: 'top', marginBottom: 16 },
  decisionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  btnLabel: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  deleteBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deleteModalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, borderWidth: 1.5, marginTop: 14 },
  previewModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, paddingBottom: 16 },
  previewTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', flex: 1 },
  previewCloseBtn: { padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  previewImageContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  previewImage: { width: '100%', height: '100%', borderRadius: 12 }
});

export default DriverManagementScreen;
