"use client";

import { useCallback, useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

// One shared listener so the toolbar button and the install nudge use the same browser prompt.
let deferredPrompt: InstallPromptEvent | null = null;
let installedFlag = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferredPrompt = null;
    notify();
  });
}

export type InstallResult = "accepted" | "dismissed" | "manual";

export function usePwaInstall() {
  const [, rerender] = useState(0);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    listeners.add(listener);
    setIsIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallResult> => {
    const promptEvent = deferredPrompt;
    if (!promptEvent) return "manual";
    deferredPrompt = null;
    notify();
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        installedFlag = true;
        notify();
      }
      return choice.outcome;
    } catch (error) {
      console.error("Unable to start the app installation prompt.", error);
      return "manual";
    }
  }, []);

  return {
    installed: installedFlag || standalone,
    canPrompt: deferredPrompt !== null,
    isIos,
    install,
  };
}
