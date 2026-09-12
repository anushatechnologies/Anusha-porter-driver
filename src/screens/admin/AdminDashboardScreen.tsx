import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { getAdminMetrics, getAllOrders, getAdminNotifications, AdminMetrics } from '../../services/api';

const AdminDashboardScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, theme } = useTheme();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);
  const [showNotifModal, setShowNotifModal] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      const loadAdminData = async () => {
        try {
          const [data, ordersList, notifs] = await Promise.all([
            getAdminMetrics(),
            getAllOrders(),
            getAdminNotifications()
          ]);
          if (!isMounted) return;
          if (data) setMetrics(data);
          if (Array.isArray(notifs)) setAdminNotifications(notifs);
          if (Array.isArray(ordersList)) {
            const mappedRecent = ordersList.slice(0, 5).map((o: any) => {
              let formattedTime = 'Today';
              try {
                if (o.createdAt) {
                  formattedTime = new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
              } catch (e) {}
              const amt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || 0).replace('₹', '')) || 0;
              return {
                id: o.bookingId || `#BK_${o.id}`,
                customer: o.customerName || 'Customer',
                driver: o.driverName || 'Driver Partner',
                amount: `₹${amt}`,
                status: (o.status || 'pending').toLowerCase(),
                time: formattedTime,
              };
            });
            setRecentOrders(mappedRecent);
          }
        } catch (e) {
          console.warn('Failed to load admin metrics:', e);
        }
      };
      loadAdminData();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  const cards = [
    { label: 'Total Orders', value: metrics?.totalOrdersToday ? metrics.totalOrdersToday.toLocaleString() : '0', icon: 'package-variant-closed', iconType: 'MaterialCommunityIcons', color: colors.primary, change: '', trend: 'up' },
    { label: 'Active Orders', value: metrics?.activeOrders !== undefined ? metrics.activeOrders.toString() : '0', icon: 'flash-outline', iconType: 'Ionicons', color: colors.success, change: '', trend: 'up' },
    { label: 'Total Drivers', value: metrics?.totalDrivers !== undefined ? metrics.totalDrivers.toString() : '0', icon: 'bike', iconType: 'MaterialCommunityIcons', color: colors.info, change: '', trend: 'up' },
    { label: 'Revenue', value: metrics?.revenueToday ? `₹${metrics.revenueToday.toLocaleString()}` : '₹0', icon: 'cash-outline', iconType: 'Ionicons', color: colors.warning, change: '', trend: 'up' },
    { label: 'Pending KYC', value: metrics?.pendingKyc !== undefined ? metrics.pendingKyc.toString() : '0', icon: 'clock-outline', iconType: 'MaterialCommunityIcons', color: colors.error, change: 'Action', trend: 'down' },
    { label: 'Avg. Rating', value: metrics?.avgRating !== undefined ? `${metrics.avgRating.toFixed(1)}★` : '—', icon: 'star', iconType: 'Ionicons', color: '#FFD700', change: '', trend: 'up' },
  ];

  const statusColor: Record<string, string> = {
    active: colors.primary,
    completed: colors.success,
    pending: colors.warning,
    cancelled: colors.error,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.primary }]}>Admin Panel</Text>
          <Text style={[styles.title, { color: colors.text }]}>Dashboard</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} onPress={() => setShowNotifModal(true)}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            <View style={[styles.notifDot, { backgroundColor: colors.error, borderColor: colors.card }]} />
          </TouchableOpacity>
          <View style={[styles.adminAvatar, { backgroundColor: 'rgba(0,82,255,0.1)', borderColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Live Stats */}
        <View style={[styles.liveBanner, { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.liveText, { color: colors.success }]}>Live • System Status: Operational</Text>
          <Text style={[styles.liveTime, { color: colors.textMuted }]}>Updated just now</Text>
        </View>

        {/* Cards Grid */}
        <View style={styles.cardsGrid}>
          {cards.map(card => (
            <TouchableOpacity
              key={card.label}
              style={[styles.dashCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.8}
              onPress={() => {
                if (card.label === 'Total Drivers' || card.label === 'Pending KYC') {
                  navigation.navigate('DriverManagement');
                } else if (card.label === 'Total Orders' || card.label === 'Active Orders') {
                  navigation.navigate('OrderManagement');
                } else if (card.label === 'Revenue') {
                  navigation.navigate('PaymentManagement');
                }
              }}
            >
              <View style={styles.cardTop}>
                {card.iconType === 'Ionicons' ? (
                  <Ionicons name={card.icon as any} size={24} color={card.color} />
                ) : (
                  <MaterialCommunityIcons name={card.icon as any} size={24} color={card.color} />
                )}
                {card.change ? (
                  <View style={[
                    styles.changeBadge,
                    { backgroundColor: card.trend === 'up' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' },
                  ]}>
                    <Ionicons
                      name={card.trend === 'up' ? 'trending-up' : 'trending-down'}
                      size={10}
                      color={card.trend === 'up' ? colors.success : colors.error}
                    />
                    <Text style={[
                      styles.changeText,
                      { color: card.trend === 'up' ? colors.success : colors.error },
                    ]}>
                      {card.change}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.cardValue, { color: card.color }]}>{card.value}</Text>
              <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>{card.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revenue Chart Placeholder */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: colors.text }]}>Revenue Overview</Text>
            <View style={styles.chartPeriod}>
              <Text style={[styles.chartPeriodText, { color: colors.gray }]}>Monthly</Text>
              <Ionicons name="chevron-down" size={14} color={colors.gray} />
            </View>
          </View>
          <View style={styles.chartArea}>
            {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100].map((h, i) => (
              <View key={i} style={styles.chartBarCol}>
                <View style={[styles.chartBar, { height: `${h}%`, backgroundColor: i === 11 ? colors.primary : colors.surface }]} />
              </View>
            ))}
          </View>
          <View style={styles.chartMonths}>
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
              <Text key={m} style={[styles.chartMonth, { color: colors.textMuted }]}>{m}</Text>
            ))}
          </View>
        </View>

        {/* Recent Orders */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Orders</Text>
            <TouchableOpacity onPress={() => navigation.navigate('OrderManagement')}>
              <Text style={[styles.seeAll, { color: colors.primary }]}>View All</Text>
            </TouchableOpacity>
          </View>
          {recentOrders.map(order => (
            <View key={order.id} style={[styles.orderRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.orderLeft}>
                <View style={[styles.orderStatusDot, { backgroundColor: statusColor[order.status] || colors.gray }]} />
                <View>
                  <View style={styles.orderTopRow}>
                    <Text style={[styles.orderId, { color: colors.text }]}>{order.id}</Text>
                    <Text style={[styles.orderTime, { color: colors.textMuted }]}>{order.time}</Text>
                  </View>
                  <Text style={[styles.orderCustomer, { color: colors.textSecondary }]}>{order.customer}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name="person-outline" size={11} color={colors.textMuted} />
                    <Text style={[styles.orderDriver, { color: colors.textMuted }]}>{order.driver}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.orderRight}>
                <Text style={[styles.orderAmount, { color: colors.text }]}>{order.amount}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor[order.status] || colors.gray}22` }]}>
                  <Text style={[styles.statusText, { color: statusColor[order.status] || colors.gray }]}>
                    {order.status}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            {[
              { icon: 'people-outline', route: 'DriverManagement', label: 'Drivers', color: colors.primary },
              { icon: 'car-sport-outline', route: 'VehicleManagement', label: 'Vehicle Types', color: '#6366F1' },
              { icon: 'cube-outline', route: 'OrderManagement', label: 'Orders', color: colors.info },
              { icon: 'cash-outline', route: 'PaymentManagement', label: 'Payments', color: colors.success },
              { icon: 'person-outline', route: 'UserManagement', label: 'Users', color: colors.warning },
              { icon: 'bar-chart-outline', route: 'Analytics', label: 'Analytics', color: colors.error },
              { icon: 'wallet-outline', route: 'WalletSettings', label: 'Wallet Config', color: '#10B981' },
              { icon: 'map-outline', route: 'ServiceableAreas', label: 'Service Areas', color: '#0284C7' },
            ].map(action => (
              <TouchableOpacity key={action.label} style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => navigation.navigate(action.route as any)}>
                <Ionicons name={action.icon as any} size={22} color={action.color} />
                <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Admin Notifications Modal */}
      <Modal visible={showNotifModal} animationType="slide" transparent onRequestClose={() => setShowNotifModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%', borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="notifications" size={24} color={colors.primary} />
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>System Notifications</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNotifModal(false)}>
                <Ionicons name="close-circle" size={26} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={adminNotifications}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ backgroundColor: colors.surface, padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: colors.text }}>{item.title}</Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>
                      {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 16 }}>{item.message}</Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, marginTop: 8 }}>No notifications yet</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  adminAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  liveTime: {
    fontSize: 11,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dashCard: {
    width: '47%',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  changeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  chartCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  chartPeriod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chartPeriodText: {
    fontSize: 13,
  },
  chartArea: {
    flexDirection: 'row',
    height: 80,
    alignItems: 'flex-end',
    gap: 3,
  },
  chartBarCol: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '80%',
    borderRadius: 3,
    minHeight: 4,
  },
  chartMonths: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 3,
  },
  chartMonth: {
    flex: 1,
    fontSize: 8,
    textAlign: 'center',
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '600',
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  orderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  orderStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  orderTopRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  orderId: {
    fontSize: 13,
    fontWeight: '700',
  },
  orderTime: {
    fontSize: 11,
  },
  orderCustomer: {
    fontSize: 12,
    marginTop: 2,
  },
  orderDriver: {
    fontSize: 11,
    marginTop: 1,
  },
  orderRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  quickActions: {
    gap: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '30%',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  actionLabel: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default AdminDashboardScreen;

