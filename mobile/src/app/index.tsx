import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewNavigation } from 'react-native-webview';

const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://jibusales.jibusales00.workers.dev').replace(/\/$/, '');
const APP_ORIGIN = new URL(WEB_APP_URL).origin;
const brandGreen = '#16764a';
// WebView's published declaration currently conflicts with this Expo/RN type set.
const NativeWebView = WebView as any;

function externalScheme(url: string) {
  return /^(mailto:|tel:|sms:|whatsapp:|intent:)/i.test(url);
}

export default function HomeScreen() {
  const webView = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webView.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const handleNavigation = (request: Pick<WebViewNavigation, 'url'>) => {
    const url = request.url;
    if (url === 'about:blank' || url.startsWith(APP_ORIGIN)) return true;
    if (url.startsWith('https://')) return true;
    if (externalScheme(url)) {
      void Linking.openURL(url).catch(() => undefined);
      return false;
    }
    return false;
  };

  const retry = () => {
    setFailed(false);
    setLoading(true);
    webView.current?.reload();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <NativeWebView
        ref={webView}
        source={{ uri: WEB_APP_URL }}
        style={styles.webView}
        originWhitelist={['https://*', 'about:*', 'mailto:*', 'tel:*', 'sms:*', 'whatsapp:*', 'intent:*']}
        onShouldStartLoadWithRequest={handleNavigation}
        onNavigationStateChange={(state: WebViewNavigation) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); setFailed(true); }}
        onHttpError={({ nativeEvent }: { nativeEvent: { statusCode: number } }) => {
          if (nativeEvent.statusCode >= 500) setFailed(true);
        }}
        onContentProcessDidTerminate={() => webView.current?.reload()}
        onFileDownload={({ nativeEvent }: { nativeEvent: { downloadUrl: string } }) => {
          void Linking.openURL(nativeEvent.downloadUrl).catch(() => undefined);
        }}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptCanOpenWindowsAutomatically
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        pullToRefreshEnabled={Platform.OS === 'android'}
        contentInsetAdjustmentBehavior="never"
        startInLoadingState={false}
      />
      {loading && !failed ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <View style={styles.loadingMark}><Text style={styles.loadingMarkText}>J</Text></View>
          <Text style={styles.loadingTitle}>JibuSales</Text>
          <ActivityIndicator color={brandGreen} style={styles.spinner} />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.errorOverlay}>
          <View style={styles.errorMark}><Text style={styles.errorMarkText}>!</Text></View>
          <Text style={styles.errorTitle}>Can’t connect to JibuSales</Text>
          <Text style={styles.errorCopy}>Check your internet connection, then try again.</Text>
          <Pressable onPress={retry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  webView: { flex: 1, backgroundColor: '#ffffff' },
  loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  loadingMark: { width: 48, height: 48, borderRadius: 14, backgroundColor: brandGreen, alignItems: 'center', justifyContent: 'center' },
  loadingMarkText: { color: '#ffffff', fontSize: 28, fontWeight: '800' },
  loadingTitle: { color: '#17231c', fontSize: 19, fontWeight: '700', marginTop: 12 },
  spinner: { marginTop: 20 },
  errorOverlay: { ...StyleSheet.absoluteFill, backgroundColor: '#f5f7f5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  errorMark: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff0ee', alignItems: 'center', justifyContent: 'center' },
  errorMarkText: { color: '#a5362b', fontSize: 25, fontWeight: '700' },
  errorTitle: { color: '#17231c', fontSize: 19, fontWeight: '700', textAlign: 'center', marginTop: 18 },
  errorCopy: { color: '#66736b', fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 8 },
  retryButton: { minHeight: 46, minWidth: 130, borderRadius: 9, backgroundColor: brandGreen, alignItems: 'center', justifyContent: 'center', marginTop: 22, paddingHorizontal: 18 },
  retryLabel: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.8 },
});
