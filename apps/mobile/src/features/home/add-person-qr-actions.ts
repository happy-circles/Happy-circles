import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import * as Clipboard from 'expo-clipboard';
import type { BarcodeScanningResult } from 'expo-camera';
import type { Router } from 'expo-router';
import { Share } from 'react-native';

import { isFreshQrDelivery } from '@/features/home/contacts-sheet-helpers';
import {
  buildFriendshipInviteLink,
  extractInviteToken,
} from '@/features/invites/people-outreach-utils';
import { showBlockedActionAlert } from '@/lib/action-feedback';
import type { FriendshipInviteDeliveryResult } from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';

type CameraPermissionState = {
  readonly granted?: boolean;
} | null;

type RequestCameraPermission = () => Promise<{
  readonly granted: boolean;
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

  const myQrLink = useMemo(
    () =>
      isFreshQrDelivery(myQrDelivery)
        ? buildFriendshipInviteLink(myQrDelivery.deliveryToken)
        : null,
    [myQrDelivery],
  );

  const resetQrStateOnClose = useCallback(() => {
    setScannerOpen(false);
    setScannerLocked(false);
    setScannerMessage(null);
    setMyQrVisible(false);
    setMyQrMessage(null);
  }, []);

  function navigateToInviteToken(rawValue: string) {
    const token = extractInviteToken(rawValue);
    if (!token) {
      setMessage('Pega un link completo o un codigo valido de invitacion.');
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

    const permission = await requestCameraPermission();
    if (!permission.granted) {
      setMessage('Necesitamos permiso de camara para escanear QR.');
      return;
    }

    setScannerLocked(false);
    setScannerOpen(true);
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
        throw new Error('El servidor no devolvio un token para el QR.');
      }
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
        message: `Escanea o abre este link para conectar conmigo en Happy Circles: ${myQrLink}`,
        title: 'Mi QR de Happy Circles',
      });
    } catch {
      await Clipboard.setStringAsync(myQrLink);
      setMyQrMessage('No pudimos abrir compartir. Copiamos tu link de QR.');
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannerLocked) {
      return;
    }

    const token = extractInviteToken(result.data);
    if (!token) {
      setScannerLocked(true);
      setScannerMessage('Ese QR no parece ser una invitacion valida de Happy Circles.');
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
