// Tests run in a timezone west of UTC so date helpers that shift days (formatBirthday) would fail.
process.env.TZ = 'America/Los_Angeles';

// Unit and smoke tests for the app (NFR-14). https://docs.expo.dev/develop/unit-testing/
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // The first run transforms expo-router and react-native-paper; give cold CI runners room.
  testTimeout: 20_000,
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/android/'],
  modulePathIgnorePatterns: ['<rootDir>/android/'],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // npm/Yarn pattern from the Expo docs: transpile React Native and Expo packages, skip the rest of node_modules.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-paper|react-native-vector-icons|@tanstack/.*|socket\\.io-client|engine\\.io-client|standard-navigation)',
  ],
};
