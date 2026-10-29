import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

  if (booting) {
    return <View style={styles.center}><ActivityIndicator color={palette.green} size="large" /></View>;
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.loginWrap} keyboardShouldPersistTaps="handled">
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>J</Text></View>
            <Text style={styles.brand}>JibuSales</Text>
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

  if (user.role === 'saas_admin' || user.role === 'platform_staff') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <View><Text style={styles.brand}>JibuSales</Text><Text style={styles.subtle}>Platform account</Text></View>
          <Pressable onPress={onLogout} style={styles.textButton}><Text style={styles.textButtonLabel}>Sign out</Text></Pressable>
        </View>
        <View style={styles.platformNotice}>
          <Text style={styles.platformTitle}>SaaS Admin</Text>
          <Text style={styles.subtle}>The first mobile release currently supports secure sign-in and business dashboards. Platform administration remains available in the web app.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.dashboardWrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.green} colors={[palette.green]} />}
      >
        <View style={styles.topBar}>
          <View style={styles.brandLine}>
            <View style={styles.smallMark}><Text style={styles.smallMarkText}>J</Text></View>
            <View><Text style={styles.brand}>JibuSales</Text><Text style={styles.subtle}>Business overview</Text></View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={onLogout} style={styles.textButton}>
            <Text style={styles.textButtonLabel}>Sign out</Text>
          </Pressable>
        </View>
        <View style={styles.welcome}>
          <Text style={styles.eyebrow}>{dashboard?.businessName || 'YOUR BUSINESS'}</Text>
          <Text style={styles.welcomeTitle} numberOfLines={2}>Welcome, {displayName(user)}</Text>
          <Text style={styles.subtle}>{user.role.replace(/_/g, ' ')}</Text>
        </View>
        {error ? (
          <Pressable onPress={onRefresh} style={styles.warningBox}>
            <Text style={styles.warningText}>{error}</Text>
            <Text style={styles.warningAction}>Tap to retry</Text>
          </Pressable>
        ) : null}
        {dashboard ? (
          <>
            <Text style={styles.sectionTitle}>This month</Text>
            {metrics.length ? (
              <View style={styles.metricsGrid}>
                {metrics.map((metric) => <DashboardCard key={metric.label} {...metric} />)}
              </View>
            ) : (
              <View style={styles.emptyCard}><Text style={styles.subtle}>Your account does not have access to dashboard totals.</Text></View>
            )}
            {enabledFeatures.length > 0 ? (
              <View style={styles.featuresSection}>
                <Text style={styles.sectionTitle}>Enabled modules</Text>
                <View style={styles.featuresWrap}>
                  {enabledFeatures.map((feature) => <View key={feature} style={styles.featurePill}><Text style={styles.featureText}>{feature}</Text></View>)}
                </View>
              </View>
            ) : null}
            <Text style={styles.syncNote}>Pull down to refresh live data.</Text>
          </>
        ) : !error ? (
          <View style={styles.center}><ActivityIndicator color={palette.green} /></View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  loginWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 38 },
  brandMark: { width: 54, height: 54, borderRadius: 16, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  brandMarkText: { color: '#fff', fontWeight: '800', fontSize: 29 },
  brand: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  loginTitle: { color: palette.ink, fontSize: 27, fontWeight: '700', marginTop: 36 },
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
  dashboardWrap: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 36 },
  topBar: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 12 },
  brandLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smallMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  smallMarkText: { color: '#fff', fontSize: 22, fontWeight: '800' },
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
  featuresSection: { marginTop: 28 },
  featuresWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featurePill: { paddingVertical: 8, paddingHorizontal: 11, borderRadius: 20, backgroundColor: palette.greenSoft },
  featureText: { color: palette.green, fontSize: 12, fontWeight: '600' },
  syncNote: { color: palette.muted, fontSize: 12, textAlign: 'center', paddingTop: 22 },
  warningBox: { backgroundColor: '#fff5e8', borderWidth: 1, borderColor: '#f1d8ae', padding: 13, borderRadius: 10, marginBottom: 16 },
  warningText: { color: '#744a13', fontSize: 13, lineHeight: 19 },
  warningAction: { color: '#744a13', fontSize: 12, fontWeight: '700', marginTop: 6 },
  emptyCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 16, borderRadius: 12 },
  platformNotice: { margin: 20, marginTop: 30, padding: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 12 },
  platformTitle: { color: palette.ink, fontSize: 20, fontWeight: '700', marginBottom: 6 },
});
