import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { getAdminAnalytics, AnalyticsSummary } from '../../services/api';

const AnalyticsScreen = () => {
  const { colors, theme } = useTheme();
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
    { label: 'Total Revenue', value: fmtMoney(data?.totalRevenue), icon: 'cash-outline', iconType: 'Ionicons', color: colors.success },
    { label: 'Total Orders', value: fmt(data?.totalOrders), icon: 'package-variant-closed', iconType: 'MaterialCommunityIcons', color: colors.primary },
    { label: 'Active Drivers', value: fmt(data?.activeDrivers), icon: 'bike', iconType: 'MaterialCommunityIcons', color: colors.info },
    { label: 'Cancellation Rate', value: fmtPct(data?.cancellationRate), icon: 'close-circle-outline', iconType: 'Ionicons', color: colors.error },
  ];

  const topDrivers = data?.topDrivers || [];
  const vehicleDistribution = data?.vehicleDistribution || [];
  const hourlyData: number[] = data?.hourlyOrders || [];
  const maxH = hourlyData.length > 0 ? Math.max(...hourlyData, 1) : 1;

  const VEHICLE_COLORS = [colors.primary, colors.info, colors.warning, colors.success, colors.error];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Analytics</Text>
        <TouchableOpacity style={[styles.exportBtn, { backgroundColor: 'rgba(0,82,255,0.1)', borderColor: colors.primary }]} onPress={() => fetchAnalytics(period)}>
          <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          <Text style={[styles.exportText, { color: colors.primary }]}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Period Tabs */}
      <View style={[styles.periodSelector, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(['week', 'month', 'year'] as const).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodBtn, period === p && { backgroundColor: colors.primary }]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, { color: period === p ? '#FFFFFF' : colors.gray }]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading analytics...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Key Metrics */}
          <View style={styles.metricsGrid}>
            {metrics.map(m => (
              <View key={m.label} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {m.iconType === 'Ionicons' ? (
                  <Ionicons name={m.icon as any} size={24} color={m.color} />
                ) : (
                  <MaterialCommunityIcons name={m.icon as any} size={24} color={m.color} />
                )}
                <Text style={[styles.metricValue, { color: colors.text }]}>{m.value}</Text>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
              </View>
            ))}
          </View>

          {/* Hourly Orders Chart */}
          {hourlyData.length > 0 && (
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.chartTitle, { color: colors.text }]}>Orders by Hour (Today)</Text>
              <View style={styles.chart}>
                {hourlyData.map((h, i) => (
                  <View key={i} style={styles.chartBarCol}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: `${Math.max((h / maxH) * 100, 4)}%`,
                          backgroundColor: h === maxH ? colors.primary : colors.surface,
                        },
                      ]}
                    />
                    <Text style={[styles.chartLabel, { color: colors.textMuted }]}>{i * 2}h</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Vehicle Distribution */}
          {vehicleDistribution.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Vehicle Distribution</Text>
              {vehicleDistribution.map((v, idx) => (
                <View key={v.type} style={styles.distRow}>
                  <View style={styles.distLeft}>
                    <View style={[styles.distDot, { backgroundColor: VEHICLE_COLORS[idx % VEHICLE_COLORS.length] }]} />
                    <Text style={[styles.distType, { color: colors.text }]}>{v.type}</Text>
                  </View>
                  <View style={[styles.distBarBg, { backgroundColor: colors.surface }]}>
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
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Top Performing Drivers</Text>
              {topDrivers.map((driver, idx) => {
                const rank = idx + 1;
                const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                const medalColor = rank <= 3 ? medalColors[rank - 1] : undefined;
                return (
                  <View key={idx} style={styles.driverRow}>
                    <View style={[styles.rankBadge, { backgroundColor: colors.surface }, medalColor && { backgroundColor: `${medalColor}33` }]}>
                      <Text style={[styles.rankText, { color: colors.gray }, medalColor && { color: medalColor }]}>
                        #{rank}
                      </Text>
                    </View>
                    <View style={styles.driverLeft}>
                      <Text style={[styles.driverName, { color: colors.text }]}>{driver.name}</Text>
                      <Text style={[styles.driverStats, { color: colors.textSecondary }]}>
                        {driver.trips} trips • {driver.rating}⭐
                      </Text>
                    </View>
                    <Text style={[styles.driverEarnings, { color: colors.success }]}>
                      {driver.earnings ? `₹${driver.earnings.toLocaleString()}` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {!data && (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <Ionicons name="analytics-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
                Analytics data not available
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
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
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  exportText: { fontWeight: '700', fontSize: 13 },
  periodSelector: { flexDirection: 'row', borderRadius: 14, padding: 4, borderWidth: 1, marginHorizontal: 20, marginBottom: 16 },
  periodBtn: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  periodText: { fontWeight: '600', fontSize: 14 },
  content: { paddingHorizontal: 20, gap: 16 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: { width: '47%', borderRadius: 18, padding: 16, borderWidth: 1, gap: 6 },
  metricValue: { fontSize: 20, fontWeight: '900' },
  metricLabel: { fontSize: 11, fontWeight: '500' },
  chartCard: { borderRadius: 18, padding: 18, borderWidth: 1 },
  chartTitle: { fontSize: 15, fontWeight: '700', marginBottom: 16 },
  chart: { flexDirection: 'row', height: 100, alignItems: 'flex-end', gap: 4 },
  chartBarCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartBar: { width: '80%', borderRadius: 4, minHeight: 4 },
  chartLabel: { fontSize: 8, textAlign: 'center' },
  sectionCard: { borderRadius: 18, padding: 18, borderWidth: 1, gap: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  distLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 120 },
  distDot: { width: 8, height: 8, borderRadius: 4 },
  distType: { fontSize: 13, fontWeight: '500' },
  distBarBg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  distBarFill: { height: '100%', borderRadius: 3 },
  distPercent: { fontSize: 12, fontWeight: '700', width: 35, textAlign: 'right' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '800' },
  driverLeft: { flex: 1 },
  driverName: { fontSize: 14, fontWeight: '700' },
  driverStats: { fontSize: 12, marginTop: 2 },
  driverEarnings: { fontSize: 14, fontWeight: '800' },
});

export default AnalyticsScreen;

