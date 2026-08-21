import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar,
  ActivityIndicator, FlatList,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { getAllOrders, AdminOrder } from '../../services/api';

type FilterStatus = 'all' | 'active' | 'completed' | 'pending' | 'cancelled';

const OrderManagementScreen = () => {
  const { colors, theme } = useTheme();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const statusColor: Record<string, string> = {
    active: colors.primary,
    completed: colors.success,
    pending: colors.warning,
    cancelled: colors.error,
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllOrders();
      setOrders(list);
    } catch (e) {
      console.warn('Failed to load orders:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const counts: Record<FilterStatus, number> = {
    all: orders.length,
    active: orders.filter(o => o.status === 'active').length,
    completed: orders.filter(o => o.status === 'completed').length,
    pending: orders.filter(o => o.status === 'pending').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  const formatTime = (dt?: string) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  const renderVehicleIcon = (type?: string) => {
    if (!type) return null;
    const t = type.toLowerCase();
    if (t.includes('bike') || t.includes('scooter'))
      return <MaterialCommunityIcons name="bike" size={18} color={colors.primary} />;
    if (t.includes('auto'))
      return <MaterialCommunityIcons name="rickshaw" size={18} color={colors.info} />;
    if (t.includes('truck') || t.includes('tata') || t.includes('mini'))
      return <MaterialCommunityIcons name="truck-delivery" size={18} color={colors.warning} />;
    return null;
  };

  const renderOrder = ({ item }: { item: AdminOrder }) => (
    <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.orderHeader}>
        <View style={styles.orderIdRow}>
          <Text style={[styles.orderId, { color: colors.text }]}>#{item.id}</Text>
          {renderVehicleIcon(item.vehicleType || (item as any).vehicle)}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor[item.status] || colors.gray}22` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor[item.status] || colors.gray }]} />
          <Text style={[styles.statusText, { color: statusColor[item.status] || colors.gray }]}>
            {item.status}
          </Text>
        </View>
      </View>

      <View style={[styles.routeSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
            {item.pickupAddress || item.pickup || '—'}
          </Text>
        </View>
        <View style={[styles.routeConnector, { marginLeft: 6, backgroundColor: colors.border }]} />
        <View style={styles.routeRow}>
          <View style={[styles.routeDot, { backgroundColor: colors.error }]} />
          <Text style={[styles.routeText, { color: colors.text }]} numberOfLines={1}>
            {item.dropAddress || item.drop || '—'}
          </Text>
        </View>
      </View>

      <View style={styles.orderMeta}>
        <View style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CUSTOMER</Text>
          <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>{item.customerName || '—'}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>DRIVER</Text>
          <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>{item.driverName || 'Unassigned'}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>FARE</Text>
          <Text style={[styles.metaValue, { color: colors.success }]}>
            {item.amount ? `₹${item.amount}` : '—'}
          </Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>TIME</Text>
          <Text style={[styles.metaValue, { color: colors.textSecondary }]}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Order Management</Text>
        <TouchableOpacity style={[styles.exportBtn, { backgroundColor: 'rgba(0,82,255,0.1)', borderColor: colors.primary }]} onPress={fetchOrders}>
          <Ionicons name="refresh-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {(['all', 'active', 'pending', 'completed', 'cancelled'] as FilterStatus[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterChip,
              { backgroundColor: colors.card, borderColor: colors.border },
              filter === f && { backgroundColor: statusColor[f] || colors.primary, borderColor: statusColor[f] || colors.primary }
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, { color: filter === f ? '#FFFFFF' : colors.gray }]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading orders...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
            No {filter === 'all' ? '' : filter} orders found
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={renderOrder}
          ListFooterComponent={<View style={{ height: 20 }} />}
          onRefresh={fetchOrders}
          refreshing={loading}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: '800' },
  exportBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  filterScroll: { maxHeight: 50, marginBottom: 16 },
  filterRow: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontWeight: '600', fontSize: 12 },
  list: { paddingHorizontal: 20, gap: 14 },
  orderCard: { borderRadius: 18, padding: 16, borderWidth: 1 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontSize: 16, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  routeSection: { borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeText: { fontSize: 13, fontWeight: '500', flex: 1 },
  routeConnector: { width: 2, height: 10, marginVertical: 3 },
  orderMeta: { flexDirection: 'row', marginBottom: 6 },
  metaCol: { flex: 1, gap: 3 },
  metaLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  metaValue: { fontSize: 12, fontWeight: '600' },
});

export default OrderManagementScreen;

