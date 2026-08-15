import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, StatusBar, Platform, Dimensions, Modal, Pressable, ActivityIndicator, Linking, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle, G } from 'react-native-svg';
import Animated, { FadeInDown, FadeInRight, Layout } from 'react-native-reanimated';
import AsyncStorage from '../../services/asyncStorageShim';
import { getOrderHistory } from '../../services/api';
import Constants from 'expo-constants';

interface OrderHistoryItem {
  id: string;
  orderNumber: string;
  date: string;
  pickup: string;
  drop: string;
  amount: string;
  distance: string;
  status: 'active' | 'completed' | 'cancelled' | 'failed';
  rawStatus?: string;
  timeTaken?: string;
  rating?: number;
  vehicleType?: string;
  tip?: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  rawOrder?: any;
}

const { width } = Dimensions.get('window');

const PremiumHeaderBackground = () => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={isDark ? '#0F172A' : '#0D5CFF'} />
            <Stop offset="100%" stopColor={isDark ? '#1E293B' : '#003BB3'} />
          </LinearGradient>
          <LinearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.1" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bgGrad)" />
        
        {/* Abstract Premium Curves */}
        <Path 
          d="M0 150 C100 200, 200 50, 400 150 L400 0 L0 0 Z" 
          fill="url(#waveGrad)" 
        />
        <Path 
          d="M0 250 C150 150, 250 300, 400 200 L400 0 L0 0 Z" 
          fill="url(#waveGrad)" 
        />
        
        {/* Subtle grid pattern for professional delivery vibe */}
        <G opacity="0.05">
          <Path d="M0 50 H400 M0 100 H400 M0 150 H400 M0 200 H400" stroke="#FFF" strokeWidth="1" />
          <Path d="M50 0 V300 M100 0 V300 M150 0 V300 M200 0 V300 M250 0 V300 M300 0 V300 M350 0 V300" stroke="#FFF" strokeWidth="1" />
        </G>
      </Svg>
    </View>
  );
};

const OrderHistoryScreen = () => {
  const { colors, theme } = useTheme();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed' | 'cancelled' | 'failed'>('all');
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'highest_payout'>('newest');
  const [selectedOrder, setSelectedOrder] = useState<OrderHistoryItem | null>(null);
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistoryData = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) setLoading(true);
      const ordersArray = await getOrderHistory();

      const mapped = ordersArray.map((o: any, idx: number) => {
        let uiStatus: 'active' | 'completed' | 'cancelled' | 'failed' = 'completed';
        const s = (o.status || '').toLowerCase();
        if (['accepted', 'picked_up', 'transit', 'assigned', 'pending', 'searching', 'arrived', 'in_transit'].includes(s)) {
          uiStatus = 'active';
        } else if (['cancelled', 'rejected'].includes(s)) {
          uiStatus = 'cancelled';
        } else if (['failed'].includes(s)) {
          uiStatus = 'failed';
        } else {
          uiStatus = 'completed';
        }

        let formattedDate = 'Today';
        try {
          if (o.createdAt) {
            const d = new Date(o.createdAt);
            formattedDate = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        } catch (err) {}

        const safeId = (o.id !== undefined && o.id !== null) ? String(o.id) : String(idx + 1);
        let safeBookingId = o.bookingId || `#ORD-${safeId}`;
        if (!safeBookingId.startsWith('#')) {
          safeBookingId = `#${safeBookingId}`;
        }
        const rawAmt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || '0').replace('₹', '')) || 0;

        return {
          id: safeId,
          orderNumber: safeBookingId,
          date: formattedDate,
          pickup: o.pickup || o.pickupAddress || 'Pickup Location',
          drop: o.drop || o.dropAddress || 'Dropoff Location',
          amount: `₹${rawAmt}`,
          distance: o.distance || '4.5 km',
          status: uiStatus,
          rawStatus: o.status || 'completed',
          timeTaken: '22 mins',
          rating: 4.8,
          vehicleType: o.vehicleType || 'Tata Ace',
          tip: 0,
          customerName: o.customerName || o.customer_name || 'Customer',
          customerPhone: o.customerPhone || o.customer_phone || '',
          paymentMethod: 'Online UPI',
          rawOrder: o,
        };
      });

      setOrders(mapped);
    } catch (err) {
      console.warn('Failed to load order history:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadHistoryData(false);
    } catch (err) {
      if (Platform.OS === 'web') {
        (window as any).alert('Unable to refresh. Please check your internet connection and try again.');
      } else {
        Alert.alert('Refresh Failed', 'Unable to refresh task registry. Please check your internet connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const isDark = theme === 'dark';

  useFocusEffect(
    React.useCallback(() => {
      loadHistoryData(true);
    }, [])
  );

  // Apply both tab filtering and sorting
  let filteredOrders = orders.filter(
    order => activeTab === 'all' || order.status === activeTab
  );

  const completedCount = orders.filter(o => o.status === 'completed').length;
  const activeCount = orders.filter(o => !['completed', 'cancelled', 'failed'].includes(o.status)).length;
  const totalCount = orders.length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;
  
  const totalEarnings = orders.filter(o => o.status === 'completed').reduce((sum, o) => {
    const val = parseFloat(o.amount.replace('₹', ''));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
  const formattedEarnings = totalEarnings >= 1000 
    ? `₹${(totalEarnings / 1000).toFixed(1)}k`
    : `₹${totalEarnings}`;

  if (sortBy === 'highest_payout') {
    filteredOrders = filteredOrders.sort((a, b) => {
      const aVal = parseInt(a.amount.replace(/[^0-9]/g, ''));
      const bVal = parseInt(b.amount.replace(/[^0-9]/g, ''));
      return bVal - aVal;
    });
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active':
        return { 
          bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF', 
          text: '#3B82F6', 
          icon: 'time',
          glow: 'rgba(59, 130, 246, 0.4)'
        };
      case 'completed':
        return { 
          bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5', 
          text: '#10B981', 
          icon: 'checkmark-circle',
          glow: 'rgba(16, 185, 129, 0.4)'
        };
      case 'cancelled':
        return { 
          bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2', 
          text: '#EF4444', 
          icon: 'close-circle',
          glow: 'rgba(239, 68, 68, 0.4)'
        };
      case 'failed':
        return { 
          bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB', 
          text: '#F59E0B', 
          icon: 'warning',
          glow: 'rgba(245, 158, 11, 0.4)'
        };
      default:
        return { bg: colors.accent, text: colors.textSecondary, icon: 'time', glow: 'transparent' };
    }
  };

  const renderItem = ({ item, index }: { item: OrderHistoryItem; index: number }) => {
    const statusConfig = getStatusConfig(item.status);
    
    return (
      <Animated.View 
        entering={FadeInDown.delay(index * 150).springify().damping(14)}
        layout={Layout.springify()}
      >
        <TouchableOpacity 
          activeOpacity={0.85}
          onPress={() => setSelectedOrder(item)}
          style={[
            styles.orderCard, 
            { backgroundColor: colors.card, borderColor: colors.border },
            !isDark && styles.cardShadowLight
          ]}
        >
          {/* Top Row: ID, Date, Status */}
          <View style={styles.cardHeader}>
            <View>
              <View style={styles.orderIdRow}>
                <View style={[styles.idIconBox, { backgroundColor: statusConfig.bg }]}>
                  <Ionicons name="receipt" size={12} color={statusConfig.text} />
                </View>
                <Text style={[styles.orderNumber, { color: colors.text }]}>{item.orderNumber}</Text>
              </View>
              <Text style={[styles.orderDate, { color: colors.textMuted }]}>{item.date}</Text>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg, borderColor: statusConfig.glow }]}>
              {/* Pulsing indicator dot */}
              <View style={[styles.statusDot, { backgroundColor: statusConfig.text, shadowColor: statusConfig.text }]} />
              <Text style={[styles.statusText, { color: statusConfig.text }]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Middle Row: Route Timeline */}
          <View style={styles.routeContainer}>
            <View style={styles.timelineCol}>
              <View style={styles.dotStart} />
              <View style={styles.timelineLine} />
              <View style={styles.dotEnd} />
            </View>

            <View style={styles.locationsCol}>
              <View style={styles.locationBlock}>
                <Text style={[styles.locationLabel, { color: colors.textMuted }]}>PICKUP</Text>
                <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>{item.pickup}</Text>
              </View>
              <View style={styles.locationBlockBottom}>
                <Text style={[styles.locationLabel, { color: colors.textMuted }]}>DROPOFF</Text>
                <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>{item.drop}</Text>
              </View>
            </View>
            
            {/* Interactive map thumbnail placeholder */}
            <View style={[styles.mapThumbnail, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
              <Ionicons name="map" size={24} color={colors.textMuted} opacity={0.5} />
              <View style={[styles.mapOverlay, { backgroundColor: statusConfig.text }]} />
            </View>
          </View>

          {/* Bottom Row: Earnings & Distance */}
          <View style={[styles.footerRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC' }]}>
            <View style={styles.footerCol}>
              <MaterialCommunityIcons name="map-marker-distance" size={16} color={colors.textSecondary} />
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>{item.distance}</Text>
            </View>
            <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />
            <View style={styles.footerColRight}>
              <Text style={[styles.earnedLabel, { color: colors.textMuted }]}>Total Payout</Text>
              <Text style={[styles.earnedValue, { color: item.status === 'completed' ? '#10B981' : colors.text }]}>
                {item.amount}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const tabs = ['all', 'active', 'completed', 'cancelled', 'failed'] as const;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Modern Curved Header */}
      <View style={styles.headerContainer}>
        <PremiumHeaderBackground />
        
        <View style={styles.headerTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12, padding: 4 }}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Task Registry</Text>
          </View>
          <TouchableOpacity 
            style={styles.filterBtn} 
            activeOpacity={0.7}
            onPress={() => setFilterVisible(true)}
          >
            <Ionicons name="options" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{completionRate}%</Text>
            <Text style={styles.statLabel}>Completion</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active Now</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{formattedEarnings}</Text>
            <Text style={styles.statLabel}>Total Payout</Text>
          </View>
        </View>

        {/* Premium Segmented Glass Tabs */}
        <View style={styles.tabsWrapper}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={tabs}
            keyExtractor={item => item}
            contentContainerStyle={styles.tabScrollContent}
            renderItem={({ item: tab, index }) => {
              const isActive = activeTab === tab;
              return (
                <Animated.View entering={FadeInRight.delay(index * 100).springify()}>
                  <TouchableOpacity
                    style={[
                      styles.glassTab,
                      isActive && styles.glassTabActive,
                      !isDark && isActive && styles.glassTabActiveLight
                    ]}
                    onPress={() => setActiveTab(tab)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.glassTabText,
                      isActive && styles.glassTabTextActive,
                      !isDark && !isActive && { color: 'rgba(255,255,255,0.7)' }
                    ]}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            }}
          />
        </View>
      </View>

      <FlatList
        data={filteredOrders}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(200)} style={styles.emptyContainer}>
            <View style={[styles.emptyIconBg, { backgroundColor: isDark ? colors.border : '#F1F5F9' }]}>
              <Ionicons name="folder-open-outline" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Tasks Found</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              You don't have any orders matching this category yet.
            </Text>
          </Animated.View>
        }
      />

      {/* Filter Bottom Sheet (Absolute Overlay) */}
      {filterVisible && (
        <View style={[StyleSheet.absoluteFill, styles.modalBackdrop, { zIndex: 9999, elevation: 9999 }]}>
          <Pressable style={styles.modalDismissArea} onPress={() => setFilterVisible(false)} />
          
          <Animated.View entering={FadeInDown.springify()} style={[styles.bottomSheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetDragHandle} />
            
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filter & Sort</Text>
              <TouchableOpacity onPress={() => { setSortBy('newest'); setActiveTab('all'); setFilterVisible(false); }}>
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>Sort Tasks By</Text>
            <View style={styles.filterOptionsRow}>
              <TouchableOpacity 
                style={[styles.filterOptionBtn, sortBy === 'newest' && styles.filterOptionActive, { borderColor: colors.border }]}
                onPress={() => setSortBy('newest')}
                activeOpacity={0.7}
              >
                <Ionicons name="time" size={18} color={sortBy === 'newest' ? '#FFF' : colors.text} />
                <Text style={[styles.filterOptionText, sortBy === 'newest' ? { color: '#FFF' } : { color: colors.text }]}>Newest First</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.filterOptionBtn, sortBy === 'highest_payout' && styles.filterOptionActive, { borderColor: colors.border }]}
                onPress={() => setSortBy('highest_payout')}
                activeOpacity={0.7}
              >
                <Ionicons name="wallet" size={18} color={sortBy === 'highest_payout' ? '#FFF' : colors.text} />
                <Text style={[styles.filterOptionText, sortBy === 'highest_payout' ? { color: '#FFF' } : { color: colors.text }]}>Highest Payout</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.applyBtn} 
              activeOpacity={0.8}
              onPress={() => setFilterVisible(false)}
            >
              <View style={StyleSheet.absoluteFill}>
                <Svg width="100%" height="100%" preserveAspectRatio="none">
                  <Defs>
                    <LinearGradient id="applyGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0%" stopColor="#0D5CFF" />
                      <Stop offset="100%" stopColor="#003BB3" />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#applyGrad)" />
                </Svg>
              </View>
              <Text style={styles.applyBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Trip Details Interactive Modal */}
      {selectedOrder && (
        <View style={[StyleSheet.absoluteFill, styles.modalBackdrop, { zIndex: 99999, elevation: 99999 }]}>
          <Pressable style={styles.modalDismissArea} onPress={() => setSelectedOrder(null)} />
          
          <Animated.View entering={FadeInDown.springify()} style={[styles.bottomSheet, { backgroundColor: colors.card, maxHeight: '88%' }]}>
            <View style={styles.sheetDragHandle} />
            
            {/* Header */}
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>{selectedOrder.orderNumber}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{selectedOrder.date}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedOrder(null)} style={{ padding: 6 }}>
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Status & Payout Header Banner */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
              borderRadius: 12,
              padding: 14,
              marginVertical: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <View>
                <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>TRIP STATUS</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getStatusConfig(selectedOrder.status).text, marginRight: 6 }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: getStatusConfig(selectedOrder.status).text }}>
                    {selectedOrder.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>TOTAL PAYOUT</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#10B981', marginTop: 2 }}>
                  {selectedOrder.amount}
                </Text>
              </View>
            </View>

            {/* Route Details Card */}
            <View style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: colors.border,
              marginBottom: 12,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 10, letterSpacing: 0.5 }}>
                TRIP ROUTE
              </Text>
              
              {/* Pickup */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
                <View style={{ width: 24, alignItems: 'center', marginTop: 2 }}>
                  <Ionicons name="radio-button-on" size={16} color="#10B981" />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>PICKUP ADDRESS</Text>
                  <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500', marginTop: 2 }}>{selectedOrder.pickup}</Text>
                </View>
              </View>

              {/* Dropoff */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ width: 24, alignItems: 'center', marginTop: 2 }}>
                  <Ionicons name="location" size={16} color="#EF4444" />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>DROPOFF ADDRESS</Text>
                  <Text style={{ fontSize: 13, color: colors.text, fontWeight: '500', marginTop: 2 }}>{selectedOrder.drop}</Text>
                </View>
              </View>
            </View>

            {/* Info Grid */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9', padding: 12, borderRadius: 10 }}>
                <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>DISTANCE</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 }}>{selectedOrder.distance}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9', padding: 12, borderRadius: 10 }}>
                <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '600' }}>CUSTOMER</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 }} numberOfLines={1}>
                  {selectedOrder.customerName || 'Customer'}
                </Text>
              </View>
            </View>

            {/* Call Customer Button */}
            {selectedOrder.customerPhone && selectedOrder.customerPhone !== '--' && (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${selectedOrder.customerPhone}`)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#10B981',
                  paddingVertical: 12,
                  borderRadius: 12,
                  marginBottom: 10,
                }}
              >
                <Ionicons name="call" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Call Customer ({selectedOrder.customerPhone})</Text>
              </TouchableOpacity>
            )}

            {/* Active Navigation Button */}
            {selectedOrder.status === 'active' && (
              <TouchableOpacity
                onPress={() => {
                  const targetOrder = selectedOrder.rawOrder || selectedOrder;
                  setSelectedOrder(null);
                  (navigation as any).navigate('ActiveOrder', { order: targetOrder });
                }}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.primary,
                  paddingVertical: 14,
                  borderRadius: 12,
                  marginBottom: 10,
                }}
              >
                <Ionicons name="navigate" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Navigate to Active Order</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setSelectedOrder(null)}
              activeOpacity={0.8}
              style={{
                alignItems: 'center',
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                marginTop: 4,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    height: 280,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    elevation: 10,
    shadowColor: '#0D5CFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    marginBottom: 24,
  },
  statBox: {
    alignItems: 'center',
  },
  statVal: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabsWrapper: {
    marginTop: 'auto',
    paddingBottom: 20,
  },
  tabScrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  glassTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  glassTabActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  glassTabActiveLight: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  glassTabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  glassTabTextActive: {
    color: '#0D5CFF',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 100, // Extra padding for bottom tabs
  },
  orderCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
  },
  cardShadowLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  idIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  orderDate: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 2,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    width: '100%',
    opacity: 0.5,
    marginBottom: 16,
  },
  routeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineCol: {
    width: 20,
    alignItems: 'center',
    marginRight: 12,
  },
  dotStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0D5CFF',
    borderWidth: 3,
    borderColor: 'rgba(13,92,255,0.2)',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
    borderRadius: 1,
  },
  dotEnd: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 3,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  locationsCol: {
    flex: 1,
    justifyContent: 'space-between',
  },
  locationBlock: {
    marginBottom: 16,
  },
  locationBlockBottom: {
    marginTop: 'auto',
  },
  locationLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  mapThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  footerCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  verticalDivider: {
    width: 1,
    height: 24,
    opacity: 0.5,
  },
  footerColRight: {
    alignItems: 'flex-end',
  },
  earnedLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  earnedValue: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
    width: '100%',
  },
  bottomSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 24,
  },
  sheetDragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  resetText: {
    color: '#0D5CFF',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  filterSectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  filterOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  filterOptionActive: {
    backgroundColor: '#0D5CFF',
    borderColor: '#0D5CFF',
  },
  filterOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  applyBtn: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.5,
  },
});

export default OrderHistoryScreen;
