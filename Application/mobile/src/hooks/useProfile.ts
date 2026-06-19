/**
 * Persists the active profile ID to AsyncStorage so it survives app restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = '@nutritionell_profile_id';

export function useProfileId() {
  const [profileId, setProfileIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((id) => setProfileIdState(id))
      .finally(() => setLoading(false));
  }, []);

  const setProfileId = async (id: string) => {
    await AsyncStorage.setItem(STORAGE_KEY, id);
    setProfileIdState(id);
  };

  const clearProfileId = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setProfileIdState(null);
  };

  return { profileId, setProfileId, clearProfileId, loading };
}
