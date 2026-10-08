import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import * as Clipboard from 'expo-clipboard';
import { Camera, type BarcodeScanningResult } from 'expo-camera';
import type { Router } from 'expo-router';
import { Alert, AppState, Linking, Share } from 'react-native';

import { isFreshQrDelivery } from '@/features/home/contacts-sheet-helpers';
import {
  buildFriendshipInviteShareMessage,
  buildFriendshipInviteLink,
  extractInviteToken,
} from '@/features/invites/people-outreach-utils';
import { showBlockedActionAlert } from '@/lib/action-feedback';
import type { FriendshipInviteDeliveryResult } from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { assertFriendshipDeliveryCurrent } from '@/features/invites/invite-delivery-validation';

type CameraPermissionState = {
  readonly granted?: boolean;
  readonly canAskAgain?: boolean;
} | null;

type RequestCameraPermission = () => Promise<{
  readonly granted: boolean;
  readonly canAskAgain?: boolean;
}>;

type CreateExternalFriendshipInviteMutation = {
  readonly mutateAsync: (input: {
    readonly channel: 'qr';
    readonly sourceContext: string;
  }) => Promise<FriendshipInviteDeliveryResult>;
};

export function useAddPersonQrActions({
  cameraPermission,
  createExternalFriendshipInvite,
  onClose,
  requestCameraPermission,
  router,
  setBusyKey,
  setMessage,
}: {
  readonly cameraPermission: CameraPermissionState;
  readonly createExternalFriendshipInvite: CreateExternalFriendshipInviteMutation;
  readonly onClose: () => void;
  readonly requestCameraPermission: RequestCameraPermission;
  readonly router: Router;
  readonly setBusyKey: Dispatch<SetStateAction<string | null>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [myQrVisible, setMyQrVisible] = useState(false);
  const [myQrDelivery, setMyQrDelivery] = useState<FriendshipInviteDeliveryResult | null>(null);
  const [myQrMessage, setMyQrMessage] = useState<string | null>(null);
  const resumeScannerAfterSettingsRef = useRef(false);
  const cameraSettingsAttemptRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !resumeScannerAfterSettingsRef.current) {
        return;
      }

      resumeScannerAfterSettingsRef.current = false;
      const attempt = cameraSettingsAttemptRef.current;
      void Camera.getCameraPermissionsAsync()
        .then((permission) => {
          if (disposed || cameraSettingsAttemptRef.current !== attempt) {
            return;
          }

          if (!permission.granted) {
            setMessage('La cámara sigue bloqueada. Puedes mostrar tu QR para conectar.');
            return;
          }

          setMessage(null);
          setScannerLocked(false);
          setScannerOpen(true);
        })
        .catch(() => {
          if (!disposed && cameraSettingsAttemptRef.current === attempt) {
            setMessage('No pudimos comprobar la cámara. Vuelve a tocar Escanear QR.');
          }
        });
    });

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [setMessage]);

  const myQrLink = useMemo(
    () =>
      isFreshQrDelivery(myQrDelivery)
        ? buildFriendshipInviteLink(myQrDelivery.deliveryToken)
        : null,
    [myQrDelivery],
  );

  const resetQrStateOnClose = useCallback(() => {
    resumeScannerAfterSettingsRef.current = false;
    cameraSettingsAttemptRef.current += 1;
    setScannerOpen(false);
    setScannerLocked(false);
    setScannerMessage(null);
    setMyQrVisible(false);
    setMyQrDelivery(null);
    setMyQrMessage(null);
  }, []);

  function openCameraSettings() {
    Alert.alert(
      'Permiso de cámara bloqueado',
      'Permite la cámara en Ajustes para escanear QR. También puedes mostrar tu QR para conectar.',
      [
        { style: 'cancel', text: 'Ahora no' },
        {
          text: 'Abrir ajustes',
          onPress: () => {
            const attempt = cameraSettingsAttemptRef.current + 1;
            cameraSettingsAttemptRef.current = attempt;
            resumeScannerAfterSettingsRef.current = true;
            void Linking.openSettings().catch(() => {
              if (cameraSettingsAttemptRef.current === attempt) {
                resumeScannerAfterSettingsRef.current = false;
                setMessage(
                  'No pudimos abrir Ajustes. Permite la cámara desde los ajustes del teléfono.',
                );
              }
            });
          },
        },
      ],
    );
  }

  function navigateToInviteToken(rawValue: string) {
    const token = extractInviteToken(rawValue);
    if (!token) {
      setMessage('Pega un enlace completo o un código válido de invitación.');
      return;
    }

    setScannerOpen(false);
    onClose();
    pushRoute(router, {
      params: { token },
      pathname: '/invite/[token]',
    });
  }

  async function handleOpenScanner() {
    setMessage(null);
    setScannerMessage(null);
    setMyQrVisible(false);

    if (cameraPermission?.granted) {
      setScannerLocked(false);
      setScannerOpen(true);
      return;
    }

    if (cameraPermission?.canAskAgain === false) {
      openCameraSettings();
      return;
    }

    try {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setMessage('Necesitamos permiso de cámara para escanear QR.');
        if (permission.canAskAgain === false) {
          openCameraSettings();
        }
        return;
      }

      setScannerLocked(false);
      setScannerOpen(true);
    } catch {
      setMessage('No pudimos abrir la cámara. Vuelve a intentar o muestra tu QR.');
    }
  }

  async function handleRefreshMyQr() {
    setBusyKey('my-qr');
    setMyQrMessage(null);
    try {
      const delivery = await createExternalFriendshipInvite.mutateAsync({
        channel: 'qr',
        sourceContext: 'home_add_my_qr',
      });
      if (!delivery.deliveryToken) {
        throw new Error('No pudimos preparar tu QR.');
      }
      await assertFriendshipDeliveryCurrent(delivery);
      setMyQrDelivery(delivery);
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : 'No se pudo crear tu QR.';
      setMyQrMessage(failureMessage);
      showBlockedActionAlert(failureMessage, router);
    } finally {
      setBusyKey((current) => (current === 'my-qr' ? null : current));
    }
  }

  async function handleShowMyQr() {
    setMyQrVisible(true);
    setScannerOpen(false);
    setMessage(null);
    setMyQrMessage(null);

    if (isFreshQrDelivery(myQrDelivery)) {
      return;
    }

    await handleRefreshMyQr();
  }

  async function handleShareMyQr() {
    if (!myQrLink) {
      return;
    }

    try {
      await Share.share({
        message: buildFriendshipInviteShareMessage({
          inviteLink: myQrLink,
          inviteeAlias: '',
        }),
        title: 'Mi QR de Happy Circles',
      });
    } catch {
      await Clipboard.setStringAsync(myQrLink);
      setMyQrMessage('No pudimos abrir compartir. Copiamos tu enlace de QR.');
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannerLocked) {
      return;
    }

    const token = extractInviteToken(result.data);
    if (!token) {
      setScannerLocked(true);
      setScannerMessage('Ese QR no parece ser una invitación válida de Happy Circles.');
      setTimeout(() => {
        setScannerLocked(false);
      }, 1200);
      return;
    }

    setScannerLocked(true);
    navigateToInviteToken(token);
  }

  return {
    handleBarcodeScanned,
    handleOpenScanner,
    handleRefreshMyQr,
    handleShareMyQr,
    handleShowMyQr,
    myQrDelivery,
    myQrLink,
    myQrMessage,
    myQrVisible,
    resetQrStateOnClose,
    scannerMessage,
    scannerOpen,
    setMyQrVisible,
    setScannerOpen,
  };
}
