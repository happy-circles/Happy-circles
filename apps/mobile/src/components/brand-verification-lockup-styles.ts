import { StyleSheet } from 'react-native';

import { theme } from '@/lib/theme';

export const brandVerificationLockupStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  lockup: {
    minHeight: 74,
  },
  markStage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  logoStage: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  logoLayer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  customCenterLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
});
