const STORAGE_KEY = 'nutritionell_profile_id';

export function getProfileId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setProfileId(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function clearProfileId(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
