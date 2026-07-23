import Constants from 'expo-constants';

const envApiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const normalizedEnvApiBase = envApiBase
  ? envApiBase.replace(/\/+$/, '')
  : undefined;

const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

// In tunnel mode hostUri points at an Expo domain, not your backend host.
// Prefer EXPO_PUBLIC_API_BASE_URL when set, then fall back to host-derived LAN behavior.
export const API_BASE_URL = normalizedEnvApiBase ?? `http://${debuggerHost}:8000`;

export const ENDPOINTS = {
  health:          `${API_BASE_URL}/health`,
  profileOptions:  `${API_BASE_URL}/api/profile/options`,
  createProfile:   `${API_BASE_URL}/api/profile`,
  getProfile:      (id: string) => `${API_BASE_URL}/api/profile/${id}`,
  updateProfile:   (id: string) => `${API_BASE_URL}/api/profile/${id}`,
  analyze:         `${API_BASE_URL}/api/analyze`,
  analyzeMock:     `${API_BASE_URL}/api/analyze/mock`,
  greenwashingAnalyze: `${API_BASE_URL}/api/greenwashing/analyze`,
  nutritionPlan:   `${API_BASE_URL}/api/profile/nutrition-plan`,
} as const;

/** Flip to false once your Gemini API key is set in backend/.env */
export const USE_MOCK_ANALYZE = true;
