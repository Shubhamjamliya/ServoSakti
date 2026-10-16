// @react-native-firebase is native-only; the web build is a preview, so push is a no-op there.
export async function registerPushToken(_authToken: string): Promise<void> {}
export async function unregisterPushToken(_authToken: string | null): Promise<void> {}
export function listenForTokenRefresh(_authToken: string): () => void {
  return () => {};
}
