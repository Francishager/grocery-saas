import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchDashboard, login, logoutRemote, validateSession, type DashboardKpis, type FeatureMap } from '@/lib/api';
import { readSession, type SessionUser } from '@/lib/session';

const palette = {
  ink: '#17231c',
  muted: '#66736b',
  green: '#16764a',
  greenSoft: '#e7f3ec',
  line: '#e3e9e4',
  surface: '#ffffff',
  background: '#f5f7f5',
  danger: '#a5362b',
};

type DashboardState = { kpis: DashboardKpis; features: FeatureMap; businessName?: string; currency?: string };

function money(value: number, currency?: string) {
  try {
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: currency || 'UGX', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency || 'UGX'} ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value)}`;
  }
}

function displayName(user: SessionUser) {
  return user.name?.trim() || user.email;
}

function DashboardCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function MenuButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={onPress} hitSlop={10} style={styles.menuButton}>
      <View style={styles.menuBars}><View style={styles.menuBar} /><View style={styles.menuBar} /><View style={styles.menuBar} /></View>
      <Text style={styles.menuButtonLabel}>Menu</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [activePage, setActivePage] = useState<'overview' | 'modules' | 'account'>('overview');
  const [menuOpen, setMenuOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError('');
    const result = await fetchDashboard();
    if (result.kpis.status === 401 || result.features.status === 401) {
      setUser(null);
      setDashboard(null);
      return;
    }
    if (!result.kpis.data) {
      setError(result.kpis.error || 'Could not load your dashboard. Pull down to retry.');
      return;
    }
    setDashboard({
      kpis: result.kpis.data,
      features: result.features.data?.features || {},
      businessName: result.profile.data?.name,
      currency: result.profile.data?.currency || 'UGX',
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await readSession();
      if (!session) {
        if (mounted) setBooting(false);
        return;
      }
      const checked = await validateSession();
      if (checked.data?.user && mounted) {
        setUser(checked.data.user);
        await loadDashboard();
      } else if (mounted) {
        setUser(null);
      }
      if (mounted) setBooting(false);
    })().catch(() => {
      if (mounted) {
        setError('Unable to connect. Check your connection and try again.');
        setBooting(false);
      }
    });
    return () => { mounted = false; };
  }, [loadDashboard]);

  const onSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await login(email, password);
      if (!result.data?.user) {
        const body = result.data as any;
        setError(body?.forceReset
          ? 'Password setup is required. Open JibuSales in your browser and complete the password reset first.'
          : result.error || 'Sign-in failed. Check your details and try again.');
        return;
      }
      setUser(result.data.user);
      setActivePage('overview');
      setPassword('');
      await loadDashboard();
    } catch {
      setError('Could not reach JibuSales. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await loadDashboard(); }
    catch { setError('Could not refresh your dashboard. Please retry.'); }
    finally { setRefreshing(false); }
  };

  const onLogout = async () => {
    await logoutRemote();
    setUser(null);
    setDashboard(null);
    setActivePage('overview');
    setMenuOpen(false);
    setError('');
  };

  const metrics = useMemo(() => {
    if (!dashboard) return [];
    const k = dashboard.kpis;
    const items: { key: keyof DashboardKpis; label: string; detail?: string; isMoney?: boolean }[] = [
      { key: 'revenue', label: 'Sales revenue', detail: 'This month', isMoney: true },
      { key: 'salesCount', label: 'Sales', detail: 'This month' },
      { key: 'receivablesOutstanding', label: 'Receivables', detail: `${k.receivablesCount ?? 0} customer balances`, isMoney: true },
      { key: 'expenses', label: 'Operating expenses', detail: 'This month', isMoney: true },
      { key: 'grossProfit', label: 'Gross profit', detail: 'This month', isMoney: true },
      { key: 'netProfit', label: 'Net profit', detail: 'This month', isMoney: true },
      { key: 'purchases', label: 'Purchases', detail: 'This month', isMoney: true },
      { key: 'productCount', label: 'Products', detail: 'Active inventory' },
      { key: 'lowStockCount', label: 'Low stock', detail: 'Needs attention' },
      { key: 'customerCount', label: 'Customers', detail: 'In your records' },
    ];
    return items.filter((item) => k[item.key] !== null && k[item.key] !== undefined)
      .map((item) => ({
        label: item.label,
        detail: item.detail,
        value: item.isMoney ? money(Number(k[item.key]), dashboard.currency) : money(Number(k[item.key])),
      }));
  }, [dashboard]);

  const enabledFeatures = useMemo(() => Object.entries(dashboard?.features || {})
    .filter(([, value]) => value?.enabled)
    .map(([name]) => name.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))
    .sort((a, b) => a.localeCompare(b)), [dashboard]);
  const platformUser = user?.role === 'saas_admin' || user?.role === 'platform_staff';
  const pageTitle = activePage === 'overview' ? 'Overview' : activePage === 'modules' ? 'Modules' : 'Account';

  const navigate = (page: 'overview' | 'modules' | 'account') => {
    setActivePage(page);
    setMenuOpen(false);
  };

  if (booting) {
    return <View style={styles.center}><ActivityIndicator color={palette.green} size="large" /></View>;
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.loginWrap} keyboardShouldPersistTaps="handled">
            <Image source={require('@/assets/images/icon.png')} style={styles.loginLogo} resizeMode="contain" accessibilityLabel="JibuSales logo" />
            <Text style={styles.loginTitle}>Sign in to your business</Text>
            <Text style={styles.subtle}>Use the same account you use for JibuSales on the web.</Text>
            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                placeholder="name@business.com"
                placeholderTextColor="#87938b"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Enter your password"
                  placeholderTextColor="#87938b"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={onSignIn}
                />
                <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={12}>
                  <Text style={styles.showPassword}>{showPassword ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              <Pressable onPress={onSignIn} disabled={loading} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, loading && styles.disabled]}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
              </Pressable>
            </View>
            <Text style={styles.footerNote}>Your password is never stored on this device.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.appShell}>
        <View style={styles.navbar}>
          <Image source={require('@/assets/images/icon.png')} style={styles.navbarLogo} resizeMode="contain" accessibilityLabel="JibuSales" />
          <Text style={styles.navbarTitle}>{pageTitle}</Text>
          <MenuButton onPress={() => setMenuOpen(true)} />
        </View>
        {activePage === 'overview' && !platformUser ? (
          <ScrollView
            style={styles.pageScroll}
            contentContainerStyle={styles.dashboardWrap}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.green} colors={[palette.green]} />}
          >
            <View style={styles.welcome}>
              <Text style={styles.eyebrow}>{dashboard?.businessName || 'YOUR BUSINESS'}</Text>
              <Text style={styles.welcomeTitle} numberOfLines={2}>Welcome, {displayName(user)}</Text>
              <Text style={styles.subtle}>{user.role.replace(/_/g, ' ')}</Text>
            </View>
            {error ? <Pressable onPress={onRefresh} style={styles.warningBox}><Text style={styles.warningText}>{error}</Text><Text style={styles.warningAction}>Tap to retry</Text></Pressable> : null}
            {dashboard ? (
              <>
                <Text style={styles.sectionTitle}>This month</Text>
                {metrics.length ? <View style={styles.metricsGrid}>{metrics.map((metric) => <DashboardCard key={metric.label} {...metric} />)}</View> : <View style={styles.emptyCard}><Text style={styles.subtle}>Your account does not have access to dashboard totals.</Text></View>}
                <Pressable onPress={() => navigate('modules')} style={styles.modulesShortcut}>
                  <View><Text style={styles.modulesShortcutTitle}>Your modules</Text><Text style={styles.metricDetail}>{enabledFeatures.length} enabled</Text></View>
                  <Text style={styles.shortcutArrow}>›</Text>
                </Pressable>
                <Text style={styles.syncNote}>Pull down to refresh live data.</Text>
              </>
            ) : !error ? <View style={styles.loadingInline}><ActivityIndicator color={palette.green} /></View> : null}
          </ScrollView>
        ) : activePage === 'modules' && !platformUser ? (
          <ScrollView style={styles.pageScroll} contentContainerStyle={styles.dashboardWrap}>
            <Text style={styles.pageIntro}>Modules available to your business</Text>
            {enabledFeatures.length ? enabledFeatures.map((feature) => (
              <View key={feature} style={styles.moduleRow}>
                <View style={styles.moduleDot} />
                <Text style={styles.moduleName}>{feature}</Text>
                <Text style={styles.moduleStatus}>Enabled</Text>
              </View>
            )) : <View style={styles.emptyCard}><Text style={styles.subtle}>No enabled modules were returned for this account.</Text></View>}
          </ScrollView>
        ) : activePage === 'account' ? (
          <ScrollView style={styles.pageScroll} contentContainerStyle={styles.dashboardWrap}>
            <View style={styles.accountIdentity}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{displayName(user).slice(0, 1).toUpperCase()}</Text></View>
              <Text style={styles.accountName}>{displayName(user)}</Text>
              <Text style={styles.subtle}>{platformUser ? 'Platform account' : dashboard?.businessName || 'Business account'}</Text>
            </View>
            <View style={styles.accountDetails}>
              <AccountRow label="Email" value={user.email} />
              <AccountRow label="Role" value={user.role.replace(/_/g, ' ')} />
              {(user as any).branchId ? <AccountRow label="Assigned branch" value={(user as any).branchId} /> : null}
            </View>
            <Pressable onPress={onLogout} style={styles.signOutButton}><Text style={styles.signOutLabel}>Sign out</Text></Pressable>
          </ScrollView>
        ) : (
          <View style={styles.platformNotice}>
            <Text style={styles.platformTitle}>SaaS Admin</Text>
            <Text style={styles.subtle}>Platform administration remains available in the web app. The mobile workspace is focused on business operations.</Text>
          </View>
        )}
        <View style={styles.bottomNav}>
          <NavItem label="Overview" active={activePage === 'overview'} onPress={() => navigate('overview')} />
          {!platformUser ? <NavItem label="Modules" active={activePage === 'modules'} onPress={() => navigate('modules')} /> : null}
          <NavItem label="Account" active={activePage === 'account'} onPress={() => navigate('account')} />
        </View>
      </View>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.drawerRoot}>
          <Pressable style={styles.drawerScrim} onPress={() => setMenuOpen(false)} />
          <View style={styles.drawerPanel}>
            <View style={styles.drawerHeader}>
              <Image source={require('@/assets/images/icon.png')} style={styles.drawerLogo} resizeMode="contain" accessibilityLabel="JibuSales" />
              <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setMenuOpen(false)} style={styles.closeMenu}><Text style={styles.closeMenuText}>×</Text></Pressable>
            </View>
            <Text style={styles.drawerName} numberOfLines={1}>{displayName(user)}</Text>
            <Text style={styles.drawerEmail} numberOfLines={1}>{user.email}</Text>
            <View style={styles.drawerDivider} />
            <DrawerItem label="Overview" active={activePage === 'overview'} onPress={() => navigate('overview')} />
            {!platformUser ? <DrawerItem label="Modules" active={activePage === 'modules'} onPress={() => navigate('modules')} /> : null}
            <DrawerItem label="Account" active={activePage === 'account'} onPress={() => navigate('account')} />
            <View style={styles.drawerSpacer} />
            <Pressable onPress={onLogout} style={styles.drawerSignOut}><Text style={styles.drawerSignOutText}>Sign out</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.accountRow}><Text style={styles.accountLabel}>{label}</Text><Text style={styles.accountValue}>{value}</Text></View>;
}

function NavItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={styles.navItem}><Text style={[styles.navItemText, active && styles.navItemTextActive]}>{label}</Text><View style={[styles.navIndicator, active && styles.navIndicatorActive]} /></Pressable>;
}

function DrawerItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.drawerItem, active && styles.drawerItemActive]}><Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  loginWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 38 },
  loginLogo: { width: 170, height: 170, alignSelf: 'center', marginBottom: 8 },
  brand: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  loginTitle: { color: palette.ink, fontSize: 26, fontWeight: '700', marginTop: 22 },
  subtle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 5 },
  form: { marginTop: 30, gap: 10 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700', marginTop: 8 },
  input: { height: 52, borderWidth: 1, borderColor: palette.line, borderRadius: 10, backgroundColor: palette.surface, paddingHorizontal: 14, color: palette.ink, fontSize: 16 },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 64 },
  showPassword: { position: 'absolute', right: 14, top: -11, color: palette.green, fontWeight: '700' },
  primaryButton: { height: 52, backgroundColor: palette.green, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.82 },
  error: { color: palette.danger, backgroundColor: '#fff0ee', borderRadius: 8, padding: 12, lineHeight: 20, marginTop: 4 },
  footerNote: { color: palette.muted, fontSize: 12, textAlign: 'center', marginTop: 24 },
  appShell: { flex: 1, backgroundColor: palette.background },
  loadingInline: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
  navbar: { minHeight: 70, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.line, backgroundColor: palette.surface },
  navbarLogo: { width: 56, height: 56 },
  navbarTitle: { flex: 1, color: palette.ink, fontSize: 17, fontWeight: '700', marginLeft: 10 },
  menuButton: { minWidth: 60, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 3 },
  menuBars: { width: 22, gap: 4 },
  menuBar: { height: 2, borderRadius: 2, backgroundColor: palette.ink },
  menuButtonLabel: { color: palette.ink, fontSize: 10, fontWeight: '700' },
  pageScroll: { flex: 1 },
  bottomNav: { minHeight: 60, paddingHorizontal: 8, paddingTop: 5, paddingBottom: 5, flexDirection: 'row', borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.surface },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  navItemText: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  navItemTextActive: { color: palette.green, fontWeight: '700' },
  navIndicator: { height: 2, width: 26, borderRadius: 2, backgroundColor: 'transparent' },
  navIndicatorActive: { backgroundColor: palette.green },
  drawerRoot: { flex: 1, flexDirection: 'row' },
  drawerScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(12, 24, 16, 0.42)' },
  drawerPanel: { width: '82%', maxWidth: 340, height: '100%', backgroundColor: palette.surface, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18, elevation: 12 },
  drawerHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drawerLogo: { width: 70, height: 70 },
  closeMenu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeMenuText: { color: palette.muted, fontSize: 30, lineHeight: 34 },
  drawerName: { color: palette.ink, fontSize: 16, fontWeight: '700', marginTop: 14 },
  drawerEmail: { color: palette.muted, fontSize: 12, marginTop: 4 },
  drawerDivider: { height: 1, backgroundColor: palette.line, marginVertical: 18 },
  drawerItem: { minHeight: 48, borderRadius: 9, paddingHorizontal: 13, justifyContent: 'center', marginBottom: 4 },
  drawerItemActive: { backgroundColor: palette.greenSoft },
  drawerItemText: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  drawerItemTextActive: { color: palette.green, fontWeight: '700' },
  drawerSpacer: { flex: 1 },
  drawerSignOut: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 18, paddingBottom: 8 },
  drawerSignOutText: { color: palette.danger, fontSize: 14, fontWeight: '700' },
  pageIntro: { color: palette.muted, fontSize: 14, marginBottom: 16 },
  moduleRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: palette.line, gap: 10 },
  moduleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.green },
  moduleName: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  moduleStatus: { color: palette.green, fontSize: 11, fontWeight: '700' },
  modulesShortcut: { marginTop: 24, minHeight: 66, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 10 },
  modulesShortcutTitle: { color: palette.ink, fontWeight: '700', fontSize: 14 },
  shortcutArrow: { color: palette.green, fontSize: 28, lineHeight: 30 },
  accountIdentity: { alignItems: 'center', paddingVertical: 26 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.green, fontSize: 28, fontWeight: '700' },
  accountName: { color: palette.ink, fontSize: 18, fontWeight: '700', marginTop: 14 },
  accountDetails: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 10, paddingHorizontal: 14 },
  accountRow: { minHeight: 58, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: palette.line },
  accountLabel: { color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  accountValue: { color: palette.ink, fontSize: 14, marginTop: 4, textTransform: 'capitalize' },
  signOutButton: { marginTop: 20, minHeight: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e8c5c1', backgroundColor: '#fff8f7' },
  signOutLabel: { color: palette.danger, fontSize: 14, fontWeight: '700' },
  dashboardWrap: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 36 },
  topBar: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 12 },
  textButton: { paddingVertical: 10, paddingHorizontal: 12 },
  textButtonLabel: { color: palette.green, fontWeight: '700', fontSize: 14 },
  welcome: { paddingTop: 25, paddingBottom: 24 },
  eyebrow: { color: palette.green, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  welcomeTitle: { color: palette.ink, fontSize: 25, lineHeight: 31, fontWeight: '700', marginTop: 7 },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { width: '48%', minHeight: 112, flexGrow: 1, flexBasis: '44%', padding: 14, backgroundColor: palette.surface, borderRadius: 12, borderWidth: 1, borderColor: palette.line, justifyContent: 'space-between' },
  metricLabel: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  metricValue: { color: palette.ink, fontSize: 21, fontWeight: '700', marginTop: 12 },
  metricDetail: { color: palette.muted, fontSize: 11, marginTop: 5 },
  syncNote: { color: palette.muted, fontSize: 12, textAlign: 'center', paddingTop: 22 },
  warningBox: { backgroundColor: '#fff5e8', borderWidth: 1, borderColor: '#f1d8ae', padding: 13, borderRadius: 10, marginBottom: 16 },
  warningText: { color: '#744a13', fontSize: 13, lineHeight: 19 },
  warningAction: { color: '#744a13', fontSize: 12, fontWeight: '700', marginTop: 6 },
  emptyCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 16, borderRadius: 12 },
  platformNotice: { margin: 20, marginTop: 30, padding: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 12 },
  platformTitle: { color: palette.ink, fontSize: 20, fontWeight: '700', marginBottom: 6 },
});
