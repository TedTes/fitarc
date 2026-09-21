const GOOGLE_PLUGIN = '@react-native-google-signin/google-signin';

const googleIosUrlScheme = (clientId) => {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId || !clientId.endsWith(suffix)) return undefined;
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
};

module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  const iosUrlScheme = googleIosUrlScheme(iosClientId);
  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== GOOGLE_PLUGIN && name !== 'expo-apple-authentication' && name !== 'expo-web-browser';
  });

  plugins.push('expo-apple-authentication');
  if (iosUrlScheme) {
    plugins.push([GOOGLE_PLUGIN, { iosUrlScheme }]);
  }

  return {
    ...config,
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
    },
    plugins,
  };
};
