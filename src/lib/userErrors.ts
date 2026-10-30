export const USER_ERROR_EVENT = "docstitch:user-error";

export function notifyUserError(message: string) {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent(USER_ERROR_EVENT, { detail: message.trim() }),
  );
}
