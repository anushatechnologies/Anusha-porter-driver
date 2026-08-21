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
import { useTheme } from '../../theme/ThemeContext';
import { getAllUsers, setUserBlock, AppUser } from '../../services/api';

const UserManagementScreen = () => {
  const { colors, theme } = useTheme();
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
    <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.userAvatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userTopRow}>
          <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: item.status === 'blocked' ? `${colors.error}22` : `${colors.success}22` },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: item.status === 'blocked' ? colors.error : colors.success },
              ]}
            >
              {item.status || 'active'}
            </Text>
          </View>
        </View>

        <Text style={[styles.userId, { color: colors.textSecondary }]}>
          {item.phone ? item.phone : item.email ? item.email : `#USR-${item.id}`}
        </Text>

        <View style={styles.userMeta}>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            Orders: <Text style={{ color: colors.text, fontWeight: '700' }}>{item.totalOrders ?? 0}</Text>
          </Text>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>Joined: {formatDate(item.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.userActions}>
        {actionId === item.id ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.surface }]}
            onPress={() => handleToggleBlock(item)}
          >
            <Ionicons
              name={item.status === 'blocked' ? 'lock-open-outline' : 'ban-outline'}
              size={18}
              color={item.status === 'blocked' ? colors.success : colors.error}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>User Management</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>{users.length} Users</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name, phone or email..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'blocked'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              filter === f && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? '#FFFFFF' : colors.gray },
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} (
              {f === 'all'
                ? users.length
                : users.filter(u => u.status === f).length}
              )
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading users...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>
            {search ? 'No users matching your search' : `No ${filter} users found`}
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: { fontSize: 24, fontWeight: '800' },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  countText: { fontSize: 13, fontWeight: '600' },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 15 },
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
  },
  filterText: { fontWeight: '600', fontSize: 12 },
  list: { paddingHorizontal: 20, gap: 12 },
  userCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 12,
    alignItems: 'center',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontSize: 20, color: '#FFFFFF', fontWeight: '700' },
  userInfo: { flex: 1 },
  userTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  userId: { fontSize: 12, marginTop: 2 },
  userMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  metaText: { fontSize: 12 },
  userActions: { justifyContent: 'center', alignItems: 'center', width: 36 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default UserManagementScreen;
