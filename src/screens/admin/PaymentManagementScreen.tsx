import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { getAdminPayments, PaymentSummary } from '../../services/api';

const PaymentManagementScreen = () => {
  const { colors, theme } = useTheme();
  const [data, setData] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const statusColor: Record<string, string> = {
    completed: colors.success,
    pending: colors.warning,
    refunded: colors.info,
    failed: colors.error,
  };

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminPayments();
      setData(result);
    } catch (e) {
      console.warn('Failed to load payments:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const fmtMoney = (n?: number) => n !== undefined ? `₹${n.toLocaleString()}` : '—';

  const summaryCards = [
    { label: "Today's Revenue", value: fmtMoney(data?.revenueToday), icon: 'cash-outline', color: colors.success },
    { label: 'Platform Fee', value: fmtMoney(data?.platformFee), icon: 'business-outline', color: colors.primary },
    { label: 'Pending Payouts', value: fmtMoney(data?.pendingPayouts), icon: 'time-outline', color: colors.warning },
    { label: 'Refunds', value: fmtMoney(data?.refundsToday), icon: 'arrow-undo-outline', color: colors.info },
  ];

  const transactions = data?.transactions || [];

  const formatTime = (dt?: string) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Payment Management</Text>
        <TouchableOpacity style={[styles.filterBtn, { backgroundColor: 'rgba(0,82,255,0.1)', borderColor: colors.primary }]} onPress={fetchPayments}>
          <Ionicons name="refresh-outline" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading payments...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Summary Cards */}
          <View style={styles.summaryGrid}>
            {summaryCards.map(card => (
              <View key={card.label} style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={card.icon as any} size={22} color={card.color} />
                <Text style={[styles.summaryValue, { color: card.color }]}>{card.value}</Text>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{card.label}</Text>
              </View>
            ))}
          </View>

          {/* Transactions */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>

          {transactions.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <Ionicons name="card-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
                No transactions found
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                Make sure the backend has a GET /api/admin/payments endpoint.
              </Text>
            </View>
          ) : (
            transactions.map(txn => (
              <View key={String(txn.id)} style={[styles.txnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.txnHeader}>
                  <Text style={[styles.txnId, { color: colors.text }]}>#{txn.id}</Text>
                  <View style={[styles.statusPill, { backgroundColor: `${statusColor[txn.status || ''] || colors.gray}22` }]}>
                    <Text style={[styles.statusTxt, { color: statusColor[txn.status || ''] || colors.gray }]}>
                      {txn.status || '—'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.txnBody, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.txnInfo}>
                    <Text style={[styles.txnLabel, { color: colors.textMuted }]}>From</Text>
                    <Text style={[styles.txnValue, { color: colors.text }]} numberOfLines={1}>{txn.customerName || '—'}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={colors.gray} />
                  <View style={styles.txnInfo}>
                    <Text style={[styles.txnLabel, { color: colors.textMuted }]}>To</Text>
                    <Text style={[styles.txnValue, { color: colors.text }]} numberOfLines={1}>{txn.driverName || '—'}</Text>
                  </View>
                  <View style={styles.txnInfo}>
                    <Text style={[styles.txnLabel, { color: colors.textMuted }]}>Method</Text>
                    <Text style={[styles.txnValue, { color: colors.text }]}>{txn.method || '—'}</Text>
                  </View>
                </View>
                <View style={styles.txnFoot}>
                  <View>
                    <Text style={[styles.txnLabel, { color: colors.textMuted }]}>
                      Total: <Text style={styles.txnAmount}>
                        {txn.amount ? `₹${txn.amount}` : '—'}
                      </Text>
                    </Text>
                    <Text style={[styles.txnFee, { color: colors.textMuted }]}>
                      Platform fee: {txn.fee ? `₹${txn.fee}` : '—'} • Driver gets: {txn.net ? `₹${txn.net}` : '—'}
                    </Text>
                  </View>
                  <Text style={[styles.txnTime, { color: colors.textSecondary }]}>{formatTime(txn.createdAt)}</Text>
                </View>
              </View>
            ))
          )}

          {/* Bulk Payout Button */}
          <TouchableOpacity style={[styles.payoutBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="wallet-outline" size={20} color="#FFFFFF" />
            <Text style={styles.payoutBtnText}>Initiate Bulk Driver Payout</Text>
          </TouchableOpacity>

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: '800' },
  filterBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCard: { width: '47%', borderRadius: 16, padding: 14, borderWidth: 1, gap: 6 },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  txnCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  txnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txnId: { fontSize: 14, fontWeight: '700' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusTxt: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  txnBody: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  txnInfo: { flex: 1 },
  txnLabel: { fontSize: 10, fontWeight: '600' },
  txnValue: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  txnFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  txnAmount: { color: '#10B981', fontWeight: '700' },
  txnFee: { fontSize: 11, marginTop: 2 },
  txnTime: { fontSize: 12 },
  payoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 16 },
  payoutBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});

export default PaymentManagementScreen;

