import type { MetadataRoute } from "next";

/**
 * The web app manifest: what a phone needs to put Streakly on its Home
 * Screen as an app, with its own icon, opening full screen without the
 * browser's toolbars. Offline use is not part of it yet.
 *
 * The colors are the light theme's page background, so the splash screen
 * and status bar match the first frame of the app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Streakly",
    short_name: "Streakly",
    description: "Stay consistent, one day at a time.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f4ec",
    theme_color: "#f9f4ec",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The flame sits well inside the safe zone, so Android can crop the
      // same art to any shape.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
