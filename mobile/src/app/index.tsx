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
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import { Directory } from 'expo-file-system';
import { Passkey, type PasskeyCreateRequest, type PasskeyGetRequest } from 'react-native-passkey';
import NativeThermalPrinter from '../../modules/thermal-printer/src';

const DEFAULT_WEB_APP_URL = 'https://jibusales.jibusales00.workers.dev';
const configuredWebAppUrl = (process.env.EXPO_PUBLIC_WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/$/, '');
const WEB_APP_URL = /^https:\/\//i.test(configuredWebAppUrl) ? configuredWebAppUrl : DEFAULT_WEB_APP_URL;
const APP_ORIGIN = getOrigin(WEB_APP_URL);
const BRIDGE_ORIGIN = APP_ORIGIN;
const brandGreen = '#16764a';
// WebView's published declaration currently conflicts with this Expo/RN type set.
const NativeWebView = WebView as any;
const NATIVE_BRIDGE_SCRIPT = `(function(){if(window.JibuNativeFile&&window.JibuNativePrinter&&window.JibuNativePush&&window.JibuNativePasskey)return true;var seq=0,pending={};function request(payload,errorText){return new Promise(function(resolve,reject){var id='n'+Date.now()+'_'+(++seq);pending[id]={resolve:resolve,reject:reject};if(!window.ReactNativeWebView){delete pending[id];reject(new Error('Native app bridge is unavailable. Update JibuSales and try again.'));return;}window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({},payload,{id:id})));setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error(errorText));}},120000);});}function reply(id,response,fallback){var p=pending[id];if(!p)return;delete pending[id];response&&response.ok?p.resolve(response.result):p.reject(new Error(response&&response.error||fallback));}window.__jibuNativePrinterReply=function(id,response){reply(id,response,'Native printer operation failed.');};window.__jibuNativePushReply=function(id,response){reply(id,response,'Native notification setup failed.');};window.__jibuNativeFileReply=function(id,response){reply(id,response,'Could not save the receipt PDF.');};window.__jibuNativePasskeyReply=function(id,response){reply(id,response,'Passkey verification failed.');};window.JibuNativePrinter={request:function(payload){return request(payload,'Printer request timed out.');}};window.JibuNativePush={permission:function(){return request({type:'push.permission'},'Notification permission check timed out.').then(function(r){return r.permission||'default';});},register:function(userInitiated){return request({type:'push.register',userInitiated:!!userInitiated},'Notification setup timed out.');}};window.JibuNativeFile={savePdf:function(filename,base64){return request({type:'file.savePdf',filename:filename,base64:base64},'Receipt save timed out.');}};window.JibuNativePasskey={get:function(options){return request({type:'passkey.get',options:options},'Fingerprint/passkey verification timed out.');},create:function(options){return request({type:'passkey.create',options:options},'Passkey setup timed out.');}};return true;})();true;`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function normalizedPushPermission(status: string) {
  return status === 'granted' || status === 'provisional' ? 'granted' : status === 'denied' ? 'denied' : 'default';
}

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
  const [loadProgress, setLoadProgress] = useState(0);
  const [failureMessage, setFailureMessage] = useState('Check your internet connection, then try again.');
  const [webViewKey, setWebViewKey] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => {
      setLoading(false);
      setFailed(true);
      setFailureMessage(`The app browser stopped at ${Math.round(loadProgress * 100)}% while opening JibuSales. Check your connection or open the site in your browser.`);
    }, 30_000);
    return () => clearTimeout(timeout);
  }, [loading, loadProgress]);

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

  useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.url;
      if (typeof route !== 'string' || !route.startsWith('/tenant/') || route.startsWith('//')) return;
      webView.current?.injectJavaScript(`window.location.assign(${JSON.stringify(`${APP_ORIGIN}${route}`)}); true;`);
    });
    return () => responseSubscription.remove();
  }, []);

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
    setLoadProgress(0);
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
    if (nativeEvent.url && getOrigin(nativeEvent.url) !== BRIDGE_ORIGIN) return;
    let request: { id?: string; type?: string; transport?: 'usb' | 'bluetooth'; deviceId?: string; commands?: string[]; userInitiated?: boolean; filename?: string; base64?: string; options?: Record<string, unknown> };
    try { request = JSON.parse(nativeEvent.data); } catch { return; }
    if (!request.id || !['printer.list', 'printer.print', 'push.permission', 'push.register', 'file.savePdf', 'passkey.get', 'passkey.create'].includes(request.type || '')) return;
    let response: { ok: boolean; result?: unknown; error?: string };
    try {
      if (request.type === 'passkey.get') {
        if (!request.options) throw new Error('Passkey challenge is missing.');
        if (request.options.userVerification !== 'required') throw new Error('The server did not require user verification.');
        if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) {
          throw new Error('No enrolled biometric is available. Use your JibuSales password to verify this switch.');
        }
        const biometric = await LocalAuthentication.authenticateAsync({
          promptMessage: 'JibuSales needs to verify it’s you',
          promptSubtitle: 'Confirm before switching businesses',
          promptDescription: 'Use your enrolled biometric. You can choose password confirmation in JibuSales instead.',
          cancelLabel: 'Cancel',
          disableDeviceFallback: true,
          biometricsSecurityLevel: 'strong',
        });
        if (!biometric.success) throw new Error('Biometric verification did not complete. Your business was not switched.');
        const assertion = await Passkey.get(request.options as unknown as PasskeyGetRequest);
        if (!assertion.id || !assertion.response?.authenticatorData || !assertion.response?.clientDataJSON || !assertion.response?.signature) {
          throw new Error('The passkey did not return a complete signed verification. Your business was not switched.');
        }
        response = { ok: true, result: assertion };
      } else if (request.type === 'passkey.create') {
        if (!request.options) throw new Error('Passkey setup challenge is missing.');
        response = { ok: true, result: await Passkey.create(request.options as unknown as PasskeyCreateRequest) };
      } else if (request.type === 'file.savePdf') {
        if (!request.filename || !request.base64) throw new Error('Receipt PDF data is missing.');
        const safeFilename = request.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const directory = await Directory.pickDirectoryAsync();
        const existingNames = new Set(directory.list().map((entry) => entry.name));
        const extensionIndex = safeFilename.toLowerCase().endsWith('.pdf') ? safeFilename.length - 4 : safeFilename.length;
        const stem = safeFilename.slice(0, extensionIndex);
        const extension = safeFilename.slice(extensionIndex) || '.pdf';
        let filename = safeFilename;
        let suffix = 2;
        while (existingNames.has(filename)) filename = `${stem} (${suffix++})${extension}`;
        const file = directory.createFile(filename, 'application/pdf');
        try {
          await file.write(request.base64, { encoding: 'base64' });
          const fileInfo = file.info();
          if (!fileInfo.exists || !fileInfo.size) throw new Error('The receipt file was created but no PDF data was written.');
        } catch (error) {
          try { file.delete(); } catch { /* Keep the original write error. */ }
          throw error;
        }
        response = { ok: true, result: { saved: true } };
      } else if (request.type === 'push.permission' || request.type === 'push.register') {
        let permission = await Notifications.getPermissionsAsync();
        if (request.type === 'push.register' && permission.status !== 'granted' && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
          if (!request.userInitiated) {
            response = { ok: true, result: { permission: normalizedPushPermission(permission.status) } };
            webView.current?.injectJavaScript(`window.__jibuNativePushReply(${JSON.stringify(request.id)}, ${JSON.stringify(response)}); true;`);
            return;
          }
          permission = await Notifications.requestPermissionsAsync();
        }
        const normalizedPermission = normalizedPushPermission(permission.status);
        if (request.type === 'push.permission' || normalizedPermission !== 'granted') {
          response = { ok: true, result: { permission: normalizedPermission } };
        } else {
          if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
              name: 'JibuSales updates',
              importance: Notifications.AndroidImportance.DEFAULT,
              vibrationPattern: [0, 250, 250, 250],
            });
          }
          const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
          if (!projectId) throw new Error('Mobile notification project configuration is missing.');
          const token = await Notifications.getExpoPushTokenAsync({ projectId });
          response = { ok: true, result: { permission: 'granted', expoPushToken: token.data, platform: Platform.OS } };
        }
      } else if (request.type === 'printer.list') {
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
    const reply = request.type?.startsWith('push.') ? '__jibuNativePushReply' : request.type?.startsWith('file.') ? '__jibuNativeFileReply' : request.type?.startsWith('passkey.') ? '__jibuNativePasskeyReply' : '__jibuNativePrinterReply';
    webView.current?.injectJavaScript(`window.${reply}(${JSON.stringify(request.id)}, ${JSON.stringify(response)}); true;`);
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
        injectedJavaScriptBeforeContentLoaded={NATIVE_BRIDGE_SCRIPT}
        injectedJavaScript={NATIVE_BRIDGE_SCRIPT}
        onNavigationStateChange={(state: WebViewNavigation) => setCanGoBack(state.canGoBack)}
        onLoadStart={() => { setLoadProgress(0); setLoading(true); setFailed(false); }}
        onLoadProgress={({ nativeEvent }: { nativeEvent: { progress: number } }) => {
          const progress = nativeEvent.progress;
          setLoadProgress(progress);
          if (progress >= 1) setLoading(false);
        }}
        onLoadEnd={() => {
          setLoadProgress(1);
          setLoading(false);
          webView.current?.injectJavaScript(NATIVE_BRIDGE_SCRIPT);
        }}
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
