"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined"
      || !("serviceWorker" in navigator)
    ) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register(
          "/yokai-sw.js",
          {
            scope: "/",
          }
        );
      } catch (error) {
        console.error(
          "YOKAI PWA service worker:",
          error
        );
      }
    };

    if (
      document.readyState === "complete"
    ) {
      void register();
      return;
    }

    window.addEventListener(
      "load",
      register,
      {
        once: true,
      }
    );

    return () => {
      window.removeEventListener(
        "load",
        register
      );
    };
  }, []);

  return null;
}
