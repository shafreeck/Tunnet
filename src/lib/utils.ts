import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely unregisters a Tauri event listener to prevent TypeErrors during race conditions.
 * @param unlisten - The unlisten function returned by Tauri's listen()
 */
export function safeUnlisten(unlisten: any) {
  if (typeof unlisten === 'function') {
    try {
      unlisten();
    } catch (e) {
      console.warn("[SafeUnlisten] Caught and suppressed a race condition error during event cleanup:", e);
    }
  } else if (unlisten instanceof Promise) {
    unlisten.then(fn => {
      if (typeof fn === 'function') {
        try {
          fn();
        } catch (e) {
          console.warn("[SafeUnlisten] Caught and suppressed a race condition during async event cleanup:", e);
        }
      }
    }).catch(e => {
       console.error("[SafeUnlisten] Failed to resolve unlisten promise:", e);
    });
  }
}
