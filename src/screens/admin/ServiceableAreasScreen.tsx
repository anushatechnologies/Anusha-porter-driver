import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import {
  getServiceableAreas,
  bulkUpdateServiceableAreas,
  toggleServiceableArea,
  addServiceableArea,
  ServiceableAreaItem,
} from '../../services/api';

const { width } = Dimensions.get('window');

const PRESET_CITIES = ['Hyderabad', 'Bangalore', 'Mumbai', 'Delhi', 'Chennai', 'Pune', 'Kolkata'];

const ServiceableAreasScreen = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();

  // Selected city & data
  const [selectedCity, setSelectedCity] = useState<string>('Hyderabad');
  const [customCityModal, setCustomCityModal] = useState<boolean>(false);
  const [customCityInput, setCustomCityInput] = useState<string>('');
  
  const [areas, setAreas] = useState<ServiceableAreaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [savingBulk, setSavingBulk] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'inactive'>('all');

  // Track pending active pincodes for bulk update
  const [activePincodesSet, setActivePincodesSet] = useState<Set<string>>(new Set());
  const [hasPendingChanges, setHasPendingChanges] = useState<boolean>(false);

  // Add Area Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newAreaName, setNewAreaName] = useState<string>('');
  const [newPincode, setNewPincode] = useState<string>('');
  const [newIsServiceable, setNewIsServiceable] = useState<boolean>(true);
  const [newCenterLat, setNewCenterLat] = useState<string>('17.4486');
  const [newCenterLng, setNewCenterLng] = useState<string>('78.3808');
  const [newRadiusKm, setNewRadiusKm] = useState<string>('5.0');
  const [submittingNew, setSubmittingNew] = useState<boolean>(false);

  const loadAreas = async (city: string, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await getServiceableAreas(city);
      if (res.success && Array.isArray(res.areas)) {
        setAreas(res.areas);
        const active = new Set(
          res.areas
            .filter((a) => a.isServiceable)
            .map((a) => a.pincode)
            .filter(Boolean)
        );
        setActivePincodesSet(active);
        setHasPendingChanges(false);
      } else {
        // Fallback default sample data if backend endpoint is fresh/empty
        const defaultSample: ServiceableAreaItem[] = [
          { id: 1, city, areaName: 'Hitech City', pincode: '500081', isServiceable: true },
          { id: 2, city, areaName: 'Madhapur', pincode: '500086', isServiceable: true },
          { id: 3, city, areaName: 'Gachibowli', pincode: '500032', isServiceable: true },
          { id: 4, city, areaName: 'Jubilee Hills', pincode: '500033', isServiceable: true },
          { id: 5, city, areaName: 'Kondapur', pincode: '500084', isServiceable: true },
          { id: 6, city, areaName: 'Banjara Hills', pincode: '500034', isServiceable: true },
          { id: 7, city, areaName: 'Kukatpally', pincode: '500072', isServiceable: true },
          { id: 8, city, areaName: 'Begumpet', pincode: '500016', isServiceable: true },
          { id: 9, city, areaName: 'Secunderabad', pincode: '500003', isServiceable: true },
          { id: 10, city, areaName: 'Ameerpet', pincode: '500038', isServiceable: true },
          { id: 11, city, areaName: 'Shamshabad Airport Zone', pincode: '501218', isServiceable: false },
        ];
        setAreas(defaultSample);
        const active = new Set(defaultSample.filter((a) => a.isServiceable).map((a) => a.pincode));
        setActivePincodesSet(active);
        setHasPendingChanges(false);
      }
    } catch (e) {
      console.warn('Error fetching serviceable areas:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAreas(selectedCity);
  }, [selectedCity]);

  // Filtered areas with complete null-safety
  const filteredAreas = useMemo(() => {
    if (!Array.isArray(areas)) return [];
    const search = searchQuery.toLowerCase().trim();
    return areas.filter((item) => {
      if (!item) return false;
      const name = String(item.areaName || '').toLowerCase();
      const pin = String(item.pincode || '');
      const matchesSearch = !search || name.includes(search) || pin.includes(search);

      const isCurrentActive = activePincodesSet.has(pin);

      if (!matchesSearch) return false;
      if (filterMode === 'active') return isCurrentActive;
      if (filterMode === 'inactive') return !isCurrentActive;
      return true;
    });
  }, [areas, searchQuery, filterMode, activePincodesSet]);

  // Toggle single area switch
  const handleToggleSingle = async (item: ServiceableAreaItem) => {
    const isCurrentlyActive = activePincodesSet.has(item.pincode);
    const nextState = !isCurrentlyActive;

    // Optimistically update local active set
    const updatedSet = new Set(activePincodesSet);
    if (nextState) {
      updatedSet.add(item.pincode);
    } else {
      updatedSet.delete(item.pincode);
    }
    setActivePincodesSet(updatedSet);
    setHasPendingChanges(true);

    // Also call backend toggle endpoint if ID exists
    if (item.id) {
      try {
        const toggleRes = await toggleServiceableArea(item.id);
        if (toggleRes.success) {
          // Sync confirmed state from server
          setAreas((prev) =>
            prev.map((a) => (a.id === item.id ? { ...a, isServiceable: nextState } : a))
          );
        }
      } catch (err) {
        console.warn('Toggle single error:', err);
      }
    }
  };

  // Bulk save approved pincodes
  const handleBulkSave = async () => {
    if (savingBulk) return;
    setSavingBulk(true);
    try {
      const activeList = Array.from(activePincodesSet);
      const res = await bulkUpdateServiceableAreas(selectedCity, activeList);

      if (res.success) {
        setHasPendingChanges(false);
        // Refresh local areas list
        setAreas((prev) =>
          prev.map((a) => ({
            ...a,
            isServiceable: activePincodesSet.has(a.pincode),
          }))
        );
        Alert.alert(
          'Serviceable Areas Saved',
          `Successfully updated ${activeList.length} approved zones in ${selectedCity}.`
        );
      } else {
        Alert.alert('Save Failed', res.message || 'Unable to update serviceable areas.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Network request failed');
    } finally {
      setSavingBulk(false);
    }
  };

  // Add new area
  const handleAddArea = async () => {
    const trimmedName = newAreaName.trim();
    const cleanPin = newPincode.replace(/\D/g, '');

    if (!trimmedName || trimmedName.length < 2) {
      Alert.alert('Invalid Area Name', 'Please enter a valid area name (e.g., Miyapur).');
      return;
    }

    if (cleanPin.length !== 6) {
      Alert.alert('Invalid Pincode', 'Please enter a valid 6-digit Indian PIN code.');
      return;
    }

    setSubmittingNew(true);
    try {
      const payload = {
        city: selectedCity,
        areaName: trimmedName,
        pincode: cleanPin,
        isServiceable: newIsServiceable,
        centerLat: parseFloat(newCenterLat) || undefined,
        centerLng: parseFloat(newCenterLng) || undefined,
        radiusKm: parseFloat(newRadiusKm) || 5.0,
      };

      const res = await addServiceableArea(payload);
      if (res.success) {
        Alert.alert('Area Added', `${trimmedName} (${cleanPin}) has been added to ${selectedCity}.`);
        setShowAddModal(false);
        setNewAreaName('');
        setNewPincode('');
        loadAreas(selectedCity);
      } else {
        Alert.alert('Failed to Add', res.message || 'Could not save new area.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Network request failed');
    } finally {
      setSubmittingNew(false);
    }
  };

  const activeCount = activePincodesSet.size;
  const totalCount = areas.length;
  const inactiveCount = totalCount - activeCount;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.card || '#111827'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Serviceable Areas</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            Admin-Approved Delivery Zones & Pincodes
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add Area</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAreas(selectedCity, true)}
            colors={[colors.primary]}
          />
        }
      >
        {/* City Selector Bar */}
        <View style={styles.citySelectorContainer}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Select Operating City:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cityPillsList}>
            {PRESET_CITIES.map((c) => {
              const isSelected = selectedCity.toLowerCase() === c.toLowerCase();
              return (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.cityPill,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedCity(c)}
                >
                  <Ionicons
                    name="location"
                    size={14}
                    color={isSelected ? '#FFFFFF' : colors.textSecondary}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.cityPillText,
                      { color: isSelected ? '#FFFFFF' : colors.text, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {c}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.cityPill, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setCustomCityModal(true)}
            >
              <Ionicons name="add-circle-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.cityPillText, { color: colors.primary, fontWeight: '600' }]}>+ Other City</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Stats Summary Cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{totalCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Areas</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{activeCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Approved (Active)</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{inactiveCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Disabled</Text>
          </View>
        </View>

        {/* Search & Filter Bar */}
        <View style={styles.searchFilterContainer}>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search area name or pincode..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.filterTabs}>
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterTab,
                  filterMode === f && { backgroundColor: `${colors.primary}22`, borderColor: colors.primary },
                ]}
                onPress={() => setFilterMode(f)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: filterMode === f ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {f === 'all' ? 'All' : f === 'active' ? '🟢 Active' : '🔴 Inactive'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Quick Batch Select / Deselect */}
        <View style={styles.quickBatchRow}>
          <TouchableOpacity
            style={styles.batchBtn}
            onPress={() => {
              const allPins = new Set(areas.map((a) => a.pincode).filter(Boolean));
              setActivePincodesSet(allPins);
              setHasPendingChanges(true);
            }}
          >
            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            <Text style={[styles.batchBtnText, { color: colors.primary }]}>Enable All In City</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.batchBtn}
            onPress={() => {
              setActivePincodesSet(new Set());
              setHasPendingChanges(true);
            }}
          >
            <Ionicons name="close-circle-outline" size={16} color={colors.error || '#EF4444'} />
            <Text style={[styles.batchBtnText, { color: colors.error || '#EF4444' }]}>Disable All</Text>
          </TouchableOpacity>
        </View>

        {/* Area List Checklist */}
        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loaderText, { color: colors.textMuted }]}>
              Loading serviceable zones for {selectedCity}...
            </Text>
          </View>
        ) : filteredAreas.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="map-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No matching areas found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Try adjusting your search query or add a new serviceable pincode.
            </Text>
          </View>
        ) : (
          <View style={styles.areasList}>
            {filteredAreas.map((item, idx) => {
              const isActive = activePincodesSet.has(item.pincode);
              return (
                <View
                  key={`${item.id || idx}_${item.pincode}`}
                  style={[
                    styles.areaCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: isActive ? '#10B98155' : colors.border,
                      borderLeftWidth: 4,
                      borderLeftColor: isActive ? '#10B981' : '#EF4444',
                    },
                  ]}
                >
                  <View style={styles.areaInfo}>
                    <View style={styles.areaTitleRow}>
                      <Text style={[styles.areaName, { color: colors.text }]}>{item.areaName}</Text>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: isActive ? '#10B98122' : '#EF444422' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: isActive ? '#10B981' : '#EF4444' },
                          ]}
                        >
                          {isActive ? 'Approved' : 'Restricted'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.pincodeRow}>
                      <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
                      <Text style={[styles.pincodeText, { color: colors.textSecondary }]}>
                        PIN: <Text style={{ fontWeight: '700', color: colors.text }}>{item.pincode}</Text>
                      </Text>
                      <Text style={[styles.bulletDot, { color: colors.textMuted }]}>•</Text>
                      <Text style={[styles.cityText, { color: colors.textMuted }]}>{item.city}</Text>
                    </View>
                  </View>

                  <View style={styles.switchCol}>
                    <Switch
                      value={isActive}
                      onValueChange={() => handleToggleSingle(item)}
                      trackColor={{ false: '#374151', true: '#10B98188' }}
                      thumbColor={isActive ? '#10B981' : '#9CA3AF'}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Save Button */}
      {hasPendingChanges && (
        <View style={[styles.floatingSaveBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={[styles.pendingSaveText, { color: colors.text }]}>
              Unsaved Changes ({activePincodesSet.size} active)
            </Text>
            <Text style={[styles.pendingSaveSub, { color: colors.textMuted }]}>
              Tap to push bulk update to live customer app
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleBulkSave}
            disabled={savingBulk}
          >
            {savingBulk ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Add New Area Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Serviceable Zone</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>City</Text>
              <TextInput
                style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                value={selectedCity}
                editable={false}
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Area Name *</Text>
              <TextInput
                style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. Miyapur, Manikonda, Financial District"
                placeholderTextColor={colors.textMuted}
                value={newAreaName}
                onChangeText={setNewAreaName}
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>PIN Code (6 digits) *</Text>
              <TextInput
                style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 500049"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={6}
                value={newPincode}
                onChangeText={(val) => setNewPincode(val.replace(/\D/g, ''))}
              />

              <View style={styles.coordsRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Center Lat</Text>
                  <TextInput
                    style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={newCenterLat}
                    onChangeText={setNewCenterLat}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>Center Lng</Text>
                  <TextInput
                    style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                    keyboardType="numeric"
                    value={newCenterLng}
                    onChangeText={setNewCenterLng}
                  />
                </View>
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Service Radius (km)</Text>
                <TextInput
                  style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                  keyboardType="numeric"
                  value={newRadiusKm}
                  onChangeText={setNewRadiusKm}
                />
              </View>

              <View style={styles.modalSwitchRow}>
                <View>
                  <Text style={[styles.modalSwitchLabel, { color: colors.text }]}>Service Status</Text>
                  <Text style={[styles.modalSwitchSub, { color: colors.textMuted }]}>
                    Allow customer booking pickups & drops immediately
                  </Text>
                </View>
                <Switch
                  value={newIsServiceable}
                  onValueChange={setNewIsServiceable}
                  trackColor={{ false: '#374151', true: '#10B98188' }}
                  thumbColor={newIsServiceable ? '#10B981' : '#9CA3AF'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={handleAddArea}
                disabled={submittingNew}
              >
                {submittingNew ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Add Zone</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom City Picker Modal */}
      <Modal visible={customCityModal} transparent animationType="fade" onRequestClose={() => setCustomCityModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Another City</Text>
              <TouchableOpacity onPress={() => setCustomCityModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>City Name</Text>
              <TextInput
                style={[styles.inputField, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. Vijayawada, Vizag, Ahmedabad"
                placeholderTextColor={colors.textMuted}
                value={customCityInput}
                onChangeText={setCustomCityInput}
              />
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                onPress={() => {
                  const c = customCityInput.trim();
                  if (c) {
                    setSelectedCity(c);
                    setCustomCityInput('');
                    setCustomCityModal(false);
                  }
                }}
              >
                <Text style={styles.modalSubmitText}>Load City Areas</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ServiceableAreasScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 12, marginTop: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  scrollContent: { padding: 16 },
  citySelectorContainer: { marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  cityPillsList: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  cityPillText: { fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  searchFilterContainer: { marginBottom: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterTabs: { flexDirection: 'row', gap: 8 },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  filterTabText: { fontSize: 12, fontWeight: '600' },
  quickBatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  batchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  batchBtnText: { fontSize: 12, fontWeight: '600' },
  loaderBox: { paddingVertical: 40, alignItems: 'center' },
  loaderText: { marginTop: 8, fontSize: 13 },
  emptyBox: {
    padding: 30,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  areasList: { gap: 8 },
  areaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  areaInfo: { flex: 1, marginRight: 12 },
  areaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  areaName: { fontSize: 15, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  pincodeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pincodeText: { fontSize: 13 },
  bulletDot: { fontSize: 12 },
  cityText: { fontSize: 12 },
  switchCol: { justifyContent: 'center' },
  floatingSaveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 6,
  },
  pendingSaveText: { fontSize: 14, fontWeight: '700' },
  pendingSaveSub: { fontSize: 11, marginTop: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalBody: { padding: 16 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  inputField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  coordsRow: { flexDirection: 'row' },
  modalSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  modalSwitchLabel: { fontSize: 14, fontWeight: '600' },
  modalSwitchSub: { fontSize: 11, maxWidth: '80%', marginTop: 2 },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
