import React, { useState, useEffect, useCallback } from 'react';
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
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import {
  getAdminVehicleTypes,
  createAdminVehicleType,
  updateAdminVehicleType,
  toggleAdminVehicleTypeStatus,
  deleteAdminVehicleType,
  VehicleTypeAdmin,
} from '../../services/api';

const { width } = Dimensions.get('window');

const ICON_OPTIONS = [
  { label: 'Bike', icon: 'bike', type: 'two_wheeler' },
  { label: 'Scooter', icon: 'scooter', type: 'scooter' },
  { label: 'Rickshaw', icon: 'rickshaw', type: 'three_wheeler' },
  { label: 'Truck Delivery', icon: 'truck-delivery', type: 'tata_ace' },
  { label: 'Van', icon: 'van-utility', type: 'pickup' },
  { label: 'Truck', icon: 'truck', type: 'truck_8ft' },
];

const VehicleManagementScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  const [vehicles, setVehicles] = useState<VehicleTypeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<VehicleTypeAdmin>({
    id: '',
    name: '',
    type: '',
    description: '',
    capacity: '',
    capacityKg: 20,
    dimensions: '',
    iconName: 'bike',
    imageUrl: '',
    baseFare: 50,
    baseKm: 1.0,
    perKmRate: 15,
    status: 'active',
    priority: 1,
  });

  const loadVehicles = useCallback(async () => {
    try {
      const data = await getAdminVehicleTypes();
      setVehicles(data);
    } catch (e) {
      console.warn('Failed to load vehicle types:', e);
      Alert.alert('Error', 'Could not retrieve vehicle categories from server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const onRefresh = () => {
    setRefreshing(true);
    loadVehicles();
  };

  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormData({
      id: '',
      name: '',
      type: '',
      description: '',
      capacity: '',
      capacityKg: 50,
      dimensions: '',
      iconName: 'truck-delivery',
      imageUrl: '',
      baseFare: 50,
      baseKm: 1.0,
      perKmRate: 15,
      status: 'active',
      priority: vehicles.length + 1,
    });
    setModalVisible(true);
  };

  const handleOpenEdit = (v: VehicleTypeAdmin) => {
    setIsEditing(true);
    setFormData({ ...v });
    setModalVisible(true);
  };

  const handleToggleStatus = async (vehicle: VehicleTypeAdmin) => {
    const nextStatus = vehicle.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await toggleAdminVehicleTypeStatus(vehicle.id, vehicle.status);
      if (res.success) {
        setVehicles(prev =>
          prev.map(item =>
            item.id === vehicle.id ? { ...item, status: nextStatus } : item
          )
        );
      } else {
        Alert.alert('Notice', res.message || 'Status update failed.');
      }
    } catch (e) {
      Alert.alert('Error', 'Network connection error while toggling status.');
    }
  };

  const handleDelete = (vehicle: VehicleTypeAdmin) => {
    Alert.alert(
      'Delete Vehicle Category',
      `Are you sure you want to remove "${vehicle.name}"? Active orders or onboarding with this type may be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteAdminVehicleType(vehicle.id);
              if (res.success) {
                setVehicles(prev => prev.filter(item => item.id !== vehicle.id));
                Alert.alert('Deleted', `"${vehicle.name}" removed successfully.`);
              } else {
                Alert.alert('Notice', res.message || 'Failed to remove vehicle category.');
              }
            } catch (e) {
              Alert.alert('Error', 'Could not delete vehicle category.');
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Validation Error', 'Vehicle category name is required.');
      return;
    }
    if (!formData.type.trim()) {
      formData.type = formData.name.toLowerCase().replace(/\s+/g, '_');
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        const res = await updateAdminVehicleType(formData.id, formData);
        if (res.success) {
          Alert.alert('Success', 'Vehicle category updated successfully!');
          setModalVisible(false);
          loadVehicles();
        } else {
          Alert.alert('Update Failed', res.message || 'Could not update vehicle category.');
        }
      } else {
        const res = await createAdminVehicleType(formData);
        if (res.success) {
          Alert.alert('Success', 'New vehicle category created successfully!');
          setModalVisible(false);
          loadVehicles();
        } else {
          Alert.alert('Creation Failed', res.message || 'Could not create vehicle category.');
        }
      }
    } catch (e) {
      Alert.alert('Network Error', 'Could not save vehicle category to backend.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Vehicle Categories</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Fleet pricing, payloads & booking options
            </Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={handleOpenAdd}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Stat Bar */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: colors.primary }]}>{vehicles.length}</Text>
          <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Total Categories</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: colors.success }]}>
            {vehicles.filter(v => v.status === 'active').length}
          </Text>
          <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Active in Apps</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: colors.error }]}>
            {vehicles.filter(v => v.status === 'inactive').length}
          </Text>
          <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Inactive / Hidden</Text>
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading vehicle categories from server...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {vehicles.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <MaterialCommunityIcons name="car-off" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Vehicle Types Configured</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Add dynamic transport categories for driver onboarding and customer bookings.
              </Text>
              <TouchableOpacity style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]} onPress={handleOpenAdd}>
                <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>Create Vehicle Type</Text>
              </TouchableOpacity>
            </View>
          ) : (
            vehicles.map(v => {
              const isActive = v.status === 'active';
              return (
                <View
                  key={v.id}
                  style={[
                    styles.vehicleCard,
                    { backgroundColor: colors.card, borderColor: isActive ? colors.border : colors.border },
                    !isActive && { opacity: 0.75 },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.priorityBadge, { backgroundColor: colors.cardLight, borderColor: colors.border }]}>
                        <Text style={[styles.priorityText, { color: colors.textMuted }]}>#{v.priority}</Text>
                      </View>
                      <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
                        <MaterialCommunityIcons name={(v.iconName as any) || 'truck'} size={24} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.vehicleName, { color: colors.text }]}>{v.name}</Text>
                          <View style={[styles.codeBadge, { backgroundColor: colors.cardLight }]}>
                            <Text style={[styles.codeText, { color: colors.textSecondary }]}>{v.type}</Text>
                          </View>
                        </View>
                        {v.description ? (
                          <Text style={[styles.vehicleDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                            {v.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Status Pill Toggle */}
                    <TouchableOpacity
                      style={[
                        styles.statusToggleBtn,
                        {
                          backgroundColor: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          borderColor: isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                        },
                      ]}
                      onPress={() => handleToggleStatus(v)}
                    >
                      <View style={[styles.statusDot, { backgroundColor: isActive ? colors.success : colors.error }]} />
                      <Text style={[styles.statusToggleText, { color: isActive ? colors.success : colors.error }]}>
                        {isActive ? 'Active' : 'Inactive'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Pricing & Capacity Metrics Grid */}
                  <View style={[styles.metricsGrid, { backgroundColor: colors.cardLight, borderColor: colors.border }]}>
                    <View style={styles.metricItem}>
                      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Base Fare</Text>
                      <Text style={[styles.metricVal, { color: colors.text }]}>₹{v.baseFare}</Text>
                      <Text style={[styles.metricSub, { color: colors.textMuted }]}>for {v.baseKm || 1} km</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Per Km Rate</Text>
                      <Text style={[styles.metricVal, { color: colors.text }]}>₹{v.perKmRate}</Text>
                      <Text style={[styles.metricSub, { color: colors.textMuted }]}>/km thereafter</Text>
                    </View>
                    <View style={styles.metricItem}>
                      <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Max Payload</Text>
                      <Text style={[styles.metricVal, { color: colors.text }]}>{v.capacityKg || 0} kg</Text>
                      <Text style={[styles.metricSub, { color: colors.textMuted }]} numberOfLines={1}>
                        {v.dimensions || 'Standard'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Footer */}
                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    <Text style={[styles.footerHint, { color: colors.textMuted }]}>
                      {isActive ? 'Visible in Onboarding & Booking' : 'Hidden from apps'}
                    </Text>
                    <View style={styles.footerBtns}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                        onPress={() => handleOpenEdit(v)}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.primary} />
                        <Text style={[styles.actionBtnText, { color: colors.primary }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: 'rgba(239, 68, 68, 0.2)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }]}
                        onPress={() => handleDelete(v)}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.error} />
                        <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Edit / Add Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {isEditing ? 'Edit Vehicle Category' : 'New Vehicle Category'}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  Configure category details, pricing, and capacity limits.
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Modal Scroll Content */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {/* Name & Type */}
              <View style={styles.inputRow}>
                <View style={[styles.inputCol, { flex: 1.2 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Category Name *</Text>
                  <TextInput
                    style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. Tata Ace, Scooter"
                    placeholderTextColor={colors.textMuted}
                    value={formData.name}
                    onChangeText={txt => {
                      setFormData(prev => ({
                        ...prev,
                        name: txt,
                        type: isEditing ? prev.type : txt.toLowerCase().replace(/\s+/g, '_'),
                      }));
                    }}
                  />
                </View>
                <View style={[styles.inputCol, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Type Code *</Text>
                  <TextInput
                    style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. tata_ace"
                    placeholderTextColor={colors.textMuted}
                    value={formData.type}
                    onChangeText={txt => setFormData(prev => ({ ...prev, type: txt.toLowerCase() }))}
                  />
                </View>
              </View>

              {/* Description */}
              <View style={styles.inputCol}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Description</Text>
                <TextInput
                  style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                  placeholder="e.g. Ideal for cartons, hardware & furniture"
                  placeholderTextColor={colors.textMuted}
                  value={formData.description}
                  onChangeText={txt => setFormData(prev => ({ ...prev, description: txt }))}
                />
              </View>

              {/* Capacity & Dimensions */}
              <View style={styles.inputRow}>
                <View style={[styles.inputCol, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Payload Limit (kg) *</Text>
                  <TextInput
                    style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. 750"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={String(formData.capacityKg || '')}
                    onChangeText={txt => setFormData(prev => ({ ...prev, capacityKg: Number(txt) || 0 }))}
                  />
                </View>
                <View style={[styles.inputCol, { flex: 1.2 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Cargo Dimensions</Text>
                  <TextInput
                    style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. 7ft x 4ft x 5ft"
                    placeholderTextColor={colors.textMuted}
                    value={formData.dimensions}
                    onChangeText={txt => setFormData(prev => ({ ...prev, dimensions: txt }))}
                  />
                </View>
              </View>

              {/* Pricing Grid */}
              <View style={styles.pricingSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Fare Configuration</Text>
                <View style={styles.inputRow}>
                  <View style={[styles.inputCol, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Base Fare (₹) *</Text>
                    <TextInput
                      style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                      placeholder="e.g. 150"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      value={String(formData.baseFare || '')}
                      onChangeText={txt => setFormData(prev => ({ ...prev, baseFare: Number(txt) || 0 }))}
                    />
                  </View>
                  <View style={[styles.inputCol, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Base Km</Text>
                    <TextInput
                      style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                      placeholder="e.g. 1.0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      value={String(formData.baseKm || 1.0)}
                      onChangeText={txt => setFormData(prev => ({ ...prev, baseKm: Number(txt) || 1.0 }))}
                    />
                  </View>
                  <View style={[styles.inputCol, { flex: 1 }]}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Per Km Rate (₹) *</Text>
                    <TextInput
                      style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                      placeholder="e.g. 25"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      value={String(formData.perKmRate || '')}
                      onChangeText={txt => setFormData(prev => ({ ...prev, perKmRate: Number(txt) || 0 }))}
                    />
                  </View>
                </View>
              </View>

              {/* Icon Selector */}
              <View style={styles.inputCol}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Select Icon</Text>
                <View style={styles.iconSelectorRow}>
                  {ICON_OPTIONS.map(opt => {
                    const isSelected = formData.iconName === opt.icon;
                    return (
                      <TouchableOpacity
                        key={opt.icon}
                        style={[
                          styles.iconSelectBtn,
                          { backgroundColor: colors.cardLight, borderColor: colors.border },
                          isSelected && { borderColor: colors.primary, backgroundColor: `${colors.primary}15`, borderWidth: 2 },
                        ]}
                        onPress={() => setFormData(prev => ({ ...prev, iconName: opt.icon }))}
                      >
                        <MaterialCommunityIcons
                          name={opt.icon as any}
                          size={22}
                          color={isSelected ? colors.primary : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.iconSelectLabel,
                            { color: isSelected ? colors.primary : colors.textSecondary },
                            isSelected && { fontWeight: '700' },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Priority & Status */}
              <View style={styles.inputRow}>
                <View style={[styles.inputCol, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Sort Priority</Text>
                  <TextInput
                    style={[styles.inputField, { backgroundColor: colors.cardLight, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g. 1"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={String(formData.priority || 1)}
                    onChangeText={txt => setFormData(prev => ({ ...prev, priority: Number(txt) || 1 }))}
                  />
                </View>

                <View style={[styles.inputCol, { flex: 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Initial Status</Text>
                  <TouchableOpacity
                    style={[
                      styles.inputField,
                      {
                        backgroundColor: colors.cardLight,
                        borderColor: colors.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      },
                    ]}
                    onPress={() =>
                      setFormData(prev => ({
                        ...prev,
                        status: prev.status === 'active' ? 'inactive' : 'active',
                      }))
                    }
                  >
                    <Text style={{ color: formData.status === 'active' ? colors.success : colors.error, fontWeight: '700' }}>
                      {formData.status === 'active' ? '● Active' : '○ Inactive'}
                    </Text>
                    <Ionicons name="swap-horizontal" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Create Category'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default VehicleManagementScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 44,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLbl: {
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 260,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  vehicleCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '800',
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 15,
    fontWeight: '700',
  },
  codeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  vehicleDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  statusToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  metricSub: {
    fontSize: 10,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  footerHint: {
    fontSize: 11,
  },
  footerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 18,
    gap: 14,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputCol: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputField: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  pricingSection: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 82, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 82, 255, 0.15)',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  iconSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconSelectBtn: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 70,
    gap: 4,
  },
  iconSelectLabel: {
    fontSize: 10,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
