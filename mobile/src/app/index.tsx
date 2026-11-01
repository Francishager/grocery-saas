import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  PermissionsAndroid,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import NativeThermalPrinter from '../../modules/thermal-printer/src';

const DEFAULT_WEB_APP_URL = 'https://jibusales.jibusales00.workers.dev';
const configuredWebAppUrl = (process.env.EXPO_PUBLIC_WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/$/, '');
const WEB_APP_URL = /^https:\/\//i.test(configuredWebAppUrl) ? configuredWebAppUrl : DEFAULT_WEB_APP_URL;
const APP_ORIGIN = getOrigin(WEB_APP_URL);
const BRIDGE_ORIGIN = APP_ORIGIN;
const brandGreen = '#16764a';
// WebView's published declaration currently conflicts with this Expo/RN type set.
const NativeWebView = WebView as any;

function externalScheme(url: string) {
  return /^(mailto:|tel:|sms:|whatsapp:|intent:)/i.test(url);
}

function getOrigin(url: string) {
  return url.match(/^https?:\/\/[^/]+/i)?.[0] || '';
}

export default function HomeScreen() {
  const webView = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [failureMessage, setFailureMessage] = useState('Check your internet connection, then try again.');
  const [webViewKey, setWebViewKey] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      setLoading(false);
      setFailed(true);
      setFailureMessage('JibuSales did not respond within 30 seconds. Check your connection or open the site in your browser.');
    }, 30_000);
    return () => clearTimeout(timeout);
  }, [loading]);

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
    if (url === 'about:blank') return true;
    if (externalScheme(url)) {
      void Linking.openURL(url).catch(() => undefined);
      return false;
    }
    if (!getOrigin(url)) return false;
    if (getOrigin(url) === APP_ORIGIN) return true;
    if (url.startsWith('https://')) return true;
    return false;
  };

  const retry = () => {
    setFailureMessage('Check your internet connection, then try again.');
    setFailed(false);
    setLoading(true);
    setWebViewKey((key) => key + 1);
  };

  const openInBrowser = () => {
    void Linking.openURL(WEB_APP_URL).catch(() => {
      setFailureMessage('Could not open the JibuSales website. Check that this device has internet access.');
    });
  };

  const handleLoadError = ({ nativeEvent }: { nativeEvent?: { description?: string; code?: number; url?: string } }) => {
    setLoading(false);
    setFailed(true);
    const description = nativeEvent?.description?.trim();
    setFailureMessage(description ? `Connection failed: ${description}` : 'The secure connection could not be established. Check internet access and try again.');
  };

  const handleNativeMessage = async ({ nativeEvent }: { nativeEvent: { data: string; url?: string } }) => {
    if (!nativeEvent.url || getOrigin(nativeEvent.url) !== BRIDGE_ORIGIN) return;
    let request: { id?: string; type?: string; transport?: 'usb' | 'bluetooth'; deviceId?: string; commands?: string[] };
    try { request = JSON.parse(nativeEvent.data); } catch { return; }
    if (!request.id || !['printer.list', 'printer.print'].includes(request.type || '')) return;
    let response: { ok: boolean; result?: unknown; error?: string };
    try {
      if (request.type === 'printer.list') {
        if (!NativeThermalPrinter) throw new Error('Printer support needs the latest JibuSales app update.');
        if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        }
        response = { ok: true, result: await NativeThermalPrinter.listPrinters() };
      } else {
        if (!NativeThermalPrinter) throw new Error('Printer support needs the latest JibuSales app update.');
        if (!request.transport || !request.deviceId || !Array.isArray(request.commands)) throw new Error('Invalid printer request.');
        if (Platform.OS === 'android' && Number(Platform.Version) >= 31 && request.transport === 'bluetooth') {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Bluetooth permission was not granted.');
        }
        await NativeThermalPrinter.print(request.transport, request.deviceId, request.commands);
        response = { ok: true, result: true };
      }
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message : 'Native printer operation failed.' };
    }
    webView.current?.injectJavaScript(`window.__jibuNativePrinterReply(${JSON.stringify(request.id)}, ${JSON.stringify(response)}); true;`);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <NativeWebView
        key={webViewKey}
        ref={webView}
        source={{ uri: WEB_APP_URL }}
        style={styles.webView}
        originWhitelist={['https://*', 'about:*', 'mailto:*', 'tel:*', 'sms:*', 'whatsapp:*', 'intent:*']}
        onShouldStartLoadWithRequest={handleNavigation}
        onMessage={handleNativeMessage}
        injectedJavaScriptBeforeContentLoaded={`(function(){var seq=0,pending={};window.__jibuNativePrinterReply=function(id,response){var p=pending[id];if(!p)return;delete pending[id];response&&response.ok?p.resolve(response.result):p.reject(new Error(response&&response.error||'Native printer operation failed.'));};window.JibuNativePrinter={request:function(payload){return new Promise(function(resolve,reject){var id='p'+Date.now()+'_'+(++seq);pending[id]={resolve:resolve,reject:reject};window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({},payload,{id:id})));setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error('Printer request timed out.'));}},30000);});}};})();true;`}
        onNavigationStateChange={(state: WebViewNavigation) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => { setLoading(true); setFailed(false); }}
        onLoadEnd={() => setLoading(false)}
        onError={handleLoadError}
        onHttpError={({ nativeEvent }: { nativeEvent: { statusCode: number; description?: string; url?: string } }) => {
          if (nativeEvent.statusCode >= 500) {
            setLoading(false);
            setFailed(true);
            setFailureMessage(`JibuSales is temporarily unavailable (server error ${nativeEvent.statusCode}). Try again shortly.`);
          }
        }}
        onContentProcessDidTerminate={() => webView.current?.reload()}
        onRenderProcessGone={() => {
          setLoading(false);
          setFailed(true);
          setFailureMessage('The app browser stopped unexpectedly. Reopen the page or try again.');
        }}
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
          <Text style={styles.errorCopy}>{failureMessage}</Text>
          <Pressable onPress={retry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
          <Pressable onPress={openInBrowser} style={({ pressed }) => [styles.browserButton, pressed && styles.pressed]}>
            <Text style={styles.browserLabel}>Open in browser</Text>
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
  browserButton: { minHeight: 44, minWidth: 130, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 18 },
  browserLabel: { color: brandGreen, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.8 },
});
