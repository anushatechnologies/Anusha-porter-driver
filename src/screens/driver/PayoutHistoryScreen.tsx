import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, StatusBar, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import AsyncStorage from '../../services/asyncStorageShim';
import { getOrderHistory } from '../../services/api';

const PayoutHistoryScreen = () => {
  const { colors, theme } = useTheme();
  const navigation = useNavigation();

  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPayoutsData = async (showLoadingSpinner = true) => {
    try {
      if (showLoadingSpinner) setLoading(true);
      const orders = await getOrderHistory();

      const completed = orders.filter((o: any) => o.status === 'completed' || o.status === 'delivered');
      const mapped = completed.map((o: any) => {
        let formattedDate = 'Recent';
        try {
          if (o.createdAt) {
            formattedDate = new Date(o.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          }
        } catch (e) {}
        const amt = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount || 0).replace('₹', '')) || 0;
        return {
          id: o.id.toString(),
          date: formattedDate,
          amount: `₹${amt}`,
          ref: `TXN${o.id.toString().slice(-6).toUpperCase()}`,
          status: 'Settled',
        };
      });
      setPayouts(mapped);
    } catch (err) {
      console.warn('Failed to load payouts:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchPayoutsData(false);
    } catch (err) {
      if (Platform.OS === 'web') {
        (window as any).alert('Unable to refresh. Please check your internet connection and try again.');
      } else {
        Alert.alert('Refresh Failed', 'Unable to refresh payouts. Please check your internet connection and try again.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchPayoutsData(true);
    }, [])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={[styles.header, { backgroundColor: colors.card }, theme === 'light' && styles.headerShadow]}>
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={[styles.backBtn, { backgroundColor: theme === 'dark' ? colors.border : '#F3F4F6' }]} 
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settlement History</Text>
          <View style={{ width: 44 }} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textSecondary }}>Fetching settlements...</Text>
        </View>
      ) : payouts.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Ionicons name="card-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>No settlements completed yet</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>Completed orders will settle automatically to your bank account.</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={payouts}
          keyExtractor={item => item.id}
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
          renderItem={({ item }) => (
            <View style={[styles.payoutCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.cardHeader}>
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar" size={16} color={colors.textSecondary} />
                  <Text style={[styles.dateText, { color: colors.text }]}>{item.date}</Text>
                </View>
                <Text style={[styles.amountText, { color: colors.success }]}>{item.amount}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.cardFooter}>
                <View>
                  <Text style={[styles.refLabel, { color: colors.textSecondary }]}>Ref No.</Text>
                  <Text style={[styles.refText, { color: colors.text }]}>{item.ref}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.success} style={{ marginRight: 4 }} />
                  <Text style={[styles.statusText, { color: colors.success }]}>{item.status}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  payoutCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 12,
    opacity: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  refText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default PayoutHistoryScreen;
