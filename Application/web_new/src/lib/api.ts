export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export const ENDPOINTS = {
  health: `${API_BASE_URL}/health`,
  profileOptions: `${API_BASE_URL}/api/profile/options`,
  createProfile: `${API_BASE_URL}/api/profile`,
  getProfile: (id: string) => `${API_BASE_URL}/api/profile/${id}`,
  updateProfile: (id: string) => `${API_BASE_URL}/api/profile/${id}`,
  analyze: `${API_BASE_URL}/api/analyze`,
  analyzeMock: `${API_BASE_URL}/api/analyze/mock`,
  nutritionPlan: `${API_BASE_URL}/api/profile/nutrition-plan`,
} as const;

/** Flip to true to hit /api/analyze/mock instead of the real Gemini+YOLO pipeline. */
export const USE_MOCK_ANALYZE = false;
