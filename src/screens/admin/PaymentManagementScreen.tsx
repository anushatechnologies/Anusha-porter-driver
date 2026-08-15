import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../theme/colors';
import { getAdminPayments, PaymentSummary } from '../../services/api';

const statusColor: Record<string, string> = {
  completed: Colors.success,
  pending: Colors.warning,
  refunded: Colors.info,
  failed: Colors.error,
};

const PaymentManagementScreen = () => {
  const [data, setData] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);

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
    { label: "Today's Revenue", value: fmtMoney(data?.revenueToday), icon: 'cash-outline', color: Colors.success },
    { label: 'Platform Fee', value: fmtMoney(data?.platformFee), icon: 'business-outline', color: Colors.primary },
    { label: 'Pending Payouts', value: fmtMoney(data?.pendingPayouts), icon: 'time-outline', color: Colors.warning },
    { label: 'Refunds', value: fmtMoney(data?.refundsToday), icon: 'arrow-undo-outline', color: Colors.info },
  ];

  const transactions = data?.transactions || [];

  const formatTime = (dt?: string) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Payment Management</Text>
        <TouchableOpacity style={styles.filterBtn} onPress={fetchPayments}>
          <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>Loading payments...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Summary Cards */}
          <View style={styles.summaryGrid}>
            {summaryCards.map(card => (
              <View key={card.label} style={styles.summaryCard}>
                <Ionicons name={card.icon as any} size={22} color={card.color} />
                <Text style={[styles.summaryValue, { color: card.color }]}>{card.value}</Text>
                <Text style={styles.summaryLabel}>{card.label}</Text>
              </View>
            ))}
          </View>

          {/* Transactions */}
          <Text style={styles.sectionTitle}>Recent Transactions</Text>

          {transactions.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 32 }}>
              <Ionicons name="card-outline" size={48} color={Colors.textMuted} />
              <Text style={{ color: Colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
                No transactions found
              </Text>
              <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                Make sure the backend has a GET /api/admin/payments endpoint.
              </Text>
            </View>
          ) : (
            transactions.map(txn => (
              <View key={String(txn.id)} style={styles.txnCard}>
                <View style={styles.txnHeader}>
                  <Text style={styles.txnId}>#{txn.id}</Text>
                  <View style={[styles.statusPill, { backgroundColor: `${statusColor[txn.status || ''] || Colors.gray}22` }]}>
                    <Text style={[styles.statusTxt, { color: statusColor[txn.status || ''] || Colors.gray }]}>
                      {txn.status || '—'}
                    </Text>
                  </View>
                </View>
                <View style={styles.txnBody}>
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnLabel}>From</Text>
                    <Text style={styles.txnValue} numberOfLines={1}>{txn.customerName || '—'}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={Colors.gray} />
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnLabel}>To</Text>
                    <Text style={styles.txnValue} numberOfLines={1}>{txn.driverName || '—'}</Text>
                  </View>
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnLabel}>Method</Text>
                    <Text style={styles.txnValue}>{txn.method || '—'}</Text>
                  </View>
                </View>
                <View style={styles.txnFoot}>
                  <View>
                    <Text style={styles.txnLabel}>
                      Total: <Text style={styles.txnAmount}>
                        {txn.amount ? `₹${txn.amount}` : '—'}
                      </Text>
                    </Text>
                    <Text style={styles.txnFee}>
                      Platform fee: {txn.fee ? `₹${txn.fee}` : '—'} • Driver gets: {txn.net ? `₹${txn.net}` : '—'}
                    </Text>
                  </View>
                  <Text style={styles.txnTime}>{formatTime(txn.createdAt)}</Text>
                </View>
              </View>
            ))
          )}

          {/* Bulk Payout Button */}
          <TouchableOpacity style={styles.payoutBtn}>
            <Ionicons name="wallet-outline" size={20} color={Colors.white} />
            <Text style={styles.payoutBtnText}>Initiate Bulk Driver Payout</Text>
          </TouchableOpacity>

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.white },
  filterBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,107,53,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,107,53,0.4)' },
  content: { paddingHorizontal: 20, gap: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryCard: { width: '47%', backgroundColor: Colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.white },
  txnCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  txnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txnId: { fontSize: 14, fontWeight: '700', color: Colors.white },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusTxt: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  txnBody: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderRadius: 12, padding: 12 },
  txnInfo: { flex: 1 },
  txnLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },
  txnValue: { fontSize: 12, color: Colors.white, fontWeight: '600', marginTop: 2 },
  txnFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  txnAmount: { color: Colors.success, fontWeight: '700' },
  txnFee: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  txnTime: { fontSize: 12, color: Colors.textSecondary },
  payoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, backgroundColor: Colors.primary, borderRadius: 16 },
  payoutBtnText: { color: Colors.white, fontWeight: '700', fontSize: 16 },
});

export default PaymentManagementScreen;
