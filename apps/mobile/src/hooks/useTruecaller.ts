/**
 * Truecaller Integration Hook
 *
 * File: apps/mobile/src/hooks/useTruecaller.ts
 *
 * Handles:
 *  - Check if Truecaller is available on device
 *  - Trigger Truecaller one-tap verification
 *  - Return phone + name on success
 *  - Fallback handling when Truecaller not installed
 */

import { useCallback, useEffect, useState } from "react";
import { NativeModules, NativeEventEmitter, Platform } from "react-native";

interface TruecallerProfile {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  accessToken: string;
  requestNonce?: string;
}

interface TruecallerState {
  isAvailable: boolean;
  isLoading: boolean;
  profile: TruecallerProfile | null;
  error: string | null;
}

// Graceful fallback if native module isn't linked
const TruecallerModule = NativeModules.TruecallerSdk || null;
const eventEmitter = TruecallerModule
  ? new NativeEventEmitter(TruecallerModule)
  : null;

/**
 * Hook to use Truecaller one-tap phone verification.
 *
 * Returns:
 * - isAvailable: whether Truecaller app is installed
 * - requestVerification: function to trigger the Truecaller flow
 * - profile: user profile data on success
 * - isLoading: whether verification is in progress
 * - error: error message if verification failed
 */
export function useTruecaller() {
  const [state, setState] = useState<TruecallerState>({
    isAvailable: false,
    isLoading: false,
    profile: null,
    error: null,
  });

  useEffect(() => {
    if (Platform.OS !== "android" || !TruecallerModule) {
      setState((s) => ({ ...s, isAvailable: false }));
      return;
    }

    // Initialize Truecaller SDK
    try {
      TruecallerModule.initializeSDK();

      // Check if Truecaller is usable on this device
      TruecallerModule.isUsable((usable: boolean) => {
        setState((s) => ({ ...s, isAvailable: usable }));
      });
    } catch (e) {
      console.warn("Truecaller SDK init failed:", e);
      setState((s) => ({ ...s, isAvailable: false }));
    }

    // Listen for verification results
    const successSub = eventEmitter?.addListener(
      "TruecallerProfileReceived",
      (profile: any) => {
        setState((s) => ({
          ...s,
          isLoading: false,
          profile: {
            firstName: profile.firstName || "",
            lastName: profile.lastName || "",
            phoneNumber: profile.phoneNumber || "",
            accessToken: profile.accessToken || "",
            requestNonce: profile.requestNonce || "",
          },
          error: null,
        }));
      }
    );

    const errorSub = eventEmitter?.addListener(
      "TruecallerVerificationFailed",
      (err: any) => {
        setState((s) => ({
          ...s,
          isLoading: false,
          error: err?.message || "Truecaller verification failed",
          profile: null,
        }));
      }
    );

    return () => {
      successSub?.remove();
      errorSub?.remove();
    };
  }, []);

  const requestVerification = useCallback(() => {
    if (!TruecallerModule || !state.isAvailable) {
      setState((s) => ({
        ...s,
        error: "Truecaller not available",
      }));
      return;
    }

    setState((s) => ({ ...s, isLoading: true, error: null, profile: null }));

    try {
      TruecallerModule.requestTrueProfile();
    } catch (e) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: "Failed to launch Truecaller",
      }));
    }
  }, [state.isAvailable]);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, profile: null, error: null, isLoading: false }));
  }, []);

  return {
    isAvailable: state.isAvailable,
    isLoading: state.isLoading,
    profile: state.profile,
    error: state.error,
    requestVerification,
    reset,
  };
}
