import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../../theme/colors';
import { getAllUsers, setUserBlock, AppUser } from '../../services/api';

const UserManagementScreen = () => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | number | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllUsers();
      setUsers(list);
    } catch (e) {
      console.warn('Failed to load users:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleBlock = async (user: AppUser) => {
    const isBlocked = user.status === 'blocked';
    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      `Are you sure you want to ${isBlocked ? 'unblock' : 'block'} ${user.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setActionId(user.id);
            try {
              const ok = await setUserBlock(user.id, !isBlocked);
              if (ok) {
                setUsers(prev =>
                  prev.map(u =>
                    u.id === user.id ? { ...u, status: isBlocked ? 'active' : 'blocked' } : u
                  )
                );
              } else {
                Alert.alert('Error', 'Failed to update user status.');
              }
            } catch {
              Alert.alert('Error', 'Could not reach the server.');
            } finally {
              setActionId(null);
            }
          },
        },
      ]
    );
  };

  const filtered = users.filter(u => {
    const matchesFilter = filter === 'all' || u.status === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      (u.name || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      (u.email || '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const formatDate = (dt?: string) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleDateString([], { month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const renderUser = ({ item }: { item: AppUser }) => (
    <View style={styles.userCard}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userTopRow}>
          <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: item.status === 'active' ? 'rgba(0,200,150,0.2)' : 'rgba(255,71,87,0.2)' },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: item.status === 'active' ? Colors.success : Colors.error },
              ]}
            >
              {item.status || 'active'}
            </Text>
          </View>
        </View>
        <Text style={styles.userId}>
          #{item.id} • {item.phone || item.email || '—'}
        </Text>
        <View style={styles.userMeta}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="cube-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>{item.totalOrders ?? 0} orders</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.userActions}>
        {actionId === item.id ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, { marginTop: 4 }]}
            onPress={() => handleToggleBlock(item)}
          >
            <Ionicons
              name={item.status === 'blocked' ? 'checkmark-circle-outline' : 'ban-outline'}
              size={18}
              color={item.status === 'blocked' ? Colors.success : Colors.error}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <Text style={styles.title}>User Management</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{users.length} users</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search-outline" size={18} color={Colors.gray} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone or email..."
          placeholderTextColor={Colors.grayDark}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.gray} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'blocked'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'all' ? ` (${users.length})` : ` (${users.filter(u => u.status === f).length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>Loading users...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
          <Text style={{ color: Colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
            {search ? 'No users match your search' : 'No users found'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={renderUser}
          ListFooterComponent={<View style={{ height: 20 }} />}
          onRefresh={fetchUsers}
          refreshing={loading}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.white },
  countBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  searchInput: { flex: 1, color: Colors.white, fontSize: 15 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  filterBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { color: Colors.gray, fontWeight: '600', fontSize: 12 },
  filterTextActive: { color: Colors.white },
  list: { paddingHorizontal: 20, gap: 12 },
  userCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    alignItems: 'center',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontSize: 20, color: Colors.white, fontWeight: '700' },
  userInfo: { flex: 1 },
  userTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '700', color: Colors.white, flex: 1, marginRight: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  userId: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  userMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.textMuted },
  userActions: { justifyContent: 'center', alignItems: 'center', width: 36 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default UserManagementScreen;
