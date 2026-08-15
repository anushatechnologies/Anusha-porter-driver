import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '../../theme/colors';
import { getAdminAnalytics, AnalyticsSummary } from '../../services/api';

const AnalyticsScreen = () => {
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async (p: 'week' | 'month' | 'year') => {
    setLoading(true);
    try {
      const result = await getAdminAnalytics(p);
      setData(result);
    } catch (e) {
      console.warn('Failed to load analytics:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  const fmt = (n?: number) => n !== undefined ? n.toLocaleString() : '—';
  const fmtMoney = (n?: number) => n !== undefined ? `₹${n.toLocaleString()}` : '—';
  const fmtPct = (n?: number) => n !== undefined ? `${n.toFixed(1)}%` : '—';

  const metrics = [
    { label: 'Total Revenue', value: fmtMoney(data?.totalRevenue), icon: 'cash-outline', iconType: 'Ionicons', color: Colors.success },
    { label: 'Total Orders', value: fmt(data?.totalOrders), icon: 'package-variant-closed', iconType: 'MaterialCommunityIcons', color: Colors.primary },
    { label: 'Active Drivers', value: fmt(data?.activeDrivers), icon: 'bike', iconType: 'MaterialCommunityIcons', color: Colors.info },
    { label: 'Cancellation Rate', value: fmtPct(data?.cancellationRate), icon: 'close-circle-outline', iconType: 'Ionicons', color: Colors.error },
  ];

  const topDrivers = data?.topDrivers || [];
  const vehicleDistribution = data?.vehicleDistribution || [];
  const hourlyData: number[] = data?.hourlyOrders || [];
  const maxH = hourlyData.length > 0 ? Math.max(...hourlyData, 1) : 1;

  const VEHICLE_COLORS = [Colors.primary, Colors.info, Colors.warning, Colors.success, Colors.error];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={() => fetchAnalytics(period)}>
          <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
          <Text style={styles.exportText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Period Tabs */}
      <View style={styles.periodSelector}>
        {(['week', 'month', 'year'] as const).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>Loading analytics...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Key Metrics */}
          <View style={styles.metricsGrid}>
            {metrics.map(m => (
              <View key={m.label} style={styles.metricCard}>
                {m.iconType === 'Ionicons' ? (
                  <Ionicons name={m.icon as any} size={24} color={m.color} />
                ) : (
                  <MaterialCommunityIcons name={m.icon as any} size={24} color={m.color} />
                )}
                <Text style={styles.metricValue}>{m.value}</Text>
                <Text style={styles.metricLabel}>{m.label}</Text>
              </View>
            ))}
          </View>

          {/* Hourly Orders Chart */}
          {hourlyData.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Orders by Hour (Today)</Text>
              <View style={styles.chart}>
                {hourlyData.map((h, i) => (
                  <View key={i} style={styles.chartBarCol}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: `${Math.max((h / maxH) * 100, 4)}%`,
                          backgroundColor: h === maxH ? Colors.primary : Colors.surface,
                        },
                      ]}
                    />
                    <Text style={styles.chartLabel}>{i * 2}h</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Vehicle Distribution */}
          {vehicleDistribution.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Vehicle Distribution</Text>
              {vehicleDistribution.map((v, idx) => (
                <View key={v.type} style={styles.distRow}>
                  <View style={styles.distLeft}>
                    <View style={[styles.distDot, { backgroundColor: VEHICLE_COLORS[idx % VEHICLE_COLORS.length] }]} />
                    <Text style={styles.distType}>{v.type}</Text>
                  </View>
                  <View style={styles.distBarBg}>
                    <View style={[styles.distBarFill, { width: `${v.percentage}%`, backgroundColor: VEHICLE_COLORS[idx % VEHICLE_COLORS.length] }]} />
                  </View>
                  <Text style={[styles.distPercent, { color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length] }]}>
                    {v.percentage}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Top Drivers Leaderboard */}
          {topDrivers.length > 0 && (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Top Performing Drivers</Text>
              {topDrivers.map((driver, idx) => {
                const rank = idx + 1;
                const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                const medalColor = rank <= 3 ? medalColors[rank - 1] : undefined;
                return (
                  <View key={idx} style={styles.driverRow}>
                    <View style={[styles.rankBadge, medalColor && { backgroundColor: `${medalColor}33` }]}>
                      <Text style={[styles.rankText, medalColor && { color: medalColor }]}>
                        #{rank}
                      </Text>
                    </View>
                    <View style={styles.driverLeft}>
                      <Text style={styles.driverName}>{driver.name}</Text>
                      <Text style={styles.driverStats}>
                        {driver.trips} trips • {driver.rating}⭐
                      </Text>
                    </View>
                    <Text style={styles.driverEarnings}>
                      {driver.earnings ? `₹${driver.earnings.toLocaleString()}` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {!data && (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <Ionicons name="analytics-outline" size={48} color={Colors.textMuted} />
              <Text style={{ color: Colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
                Analytics data not available
              </Text>
              <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                Make sure the backend has a GET /api/admin/analytics endpoint.
              </Text>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.white },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,107,53,0.15)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)' },
  exportText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  periodSelector: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: Colors.border, marginHorizontal: 20, marginBottom: 16 },
  periodBtn: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodText: { color: Colors.gray, fontWeight: '600', fontSize: 14 },
  periodTextActive: { color: Colors.white },
  content: { paddingHorizontal: 20, gap: 16 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { width: '47%', backgroundColor: Colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  metricValue: { fontSize: 20, fontWeight: '900', color: Colors.white },
  metricLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  chartCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border },
  chartTitle: { fontSize: 15, fontWeight: '700', color: Colors.white, marginBottom: 16 },
  chart: { flexDirection: 'row', height: 100, alignItems: 'flex-end', gap: 4 },
  chartBarCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBar: { width: '80%', borderRadius: 4, minHeight: 4 },
  chartLabel: { fontSize: 8, color: Colors.textMuted, textAlign: 'center' },
  sectionCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, gap: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.white },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  distLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 120 },
  distDot: { width: 8, height: 8, borderRadius: 4 },
  distType: { fontSize: 13, color: Colors.white, fontWeight: '500' },
  distBarBg: { flex: 1, height: 6, backgroundColor: Colors.surface, borderRadius: 3, overflow: 'hidden' },
  distBarFill: { height: '100%', borderRadius: 3 },
  distPercent: { fontSize: 12, fontWeight: '700', width: 35, textAlign: 'right' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '800', color: Colors.gray },
  driverLeft: { flex: 1 },
  driverName: { fontSize: 14, fontWeight: '700', color: Colors.white },
  driverStats: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  driverEarnings: { fontSize: 14, fontWeight: '800', color: Colors.success },
});

export default AnalyticsScreen;
