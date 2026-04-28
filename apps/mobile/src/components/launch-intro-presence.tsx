import { createContext, useContext } from 'react';

const LaunchIntroVisibleContext = createContext(false);

export const LaunchIntroVisibilityProvider = LaunchIntroVisibleContext.Provider;

export function useLaunchIntroVisible() {
  return useContext(LaunchIntroVisibleContext);
}
