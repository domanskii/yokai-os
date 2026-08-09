import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YOKAI OS — WRAP INTELLIGENCE",
    short_name: "YOKAI OS",
    description: "Prywatny system operacyjny YOKAI WRAP.",
    start_url: "/mobile",
    scope: "/",
    display: "standalone",
    background_color: "#080b10",
    theme_color: "#080b10",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Produkcja PRO",
        short_name: "Produkcja",
        url: "/production-pro",
        icons: [
          {
            src: "/pwa/icon-192.png",
            sizes: "192x192",
          },
        ],
      },
      {
        name: "Zamówienia",
        short_name: "Zamówienia",
        url: "/orders",
        icons: [
          {
            src: "/pwa/icon-192.png",
            sizes: "192x192",
          },
        ],
      },
      {
        name: "Powiadomienia",
        short_name: "Alerty",
        url: "/notifications",
        icons: [
          {
            src: "/pwa/icon-192.png",
            sizes: "192x192",
          },
        ],
      },
    ],
  };
}
