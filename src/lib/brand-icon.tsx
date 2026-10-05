import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Renders the app icon / favicon / iPhone home-screen icon from the official
 * logo at public/brand/logo.png (centered on black, aspect ratio preserved).
 * Falls back to the built-in paw mark when no logo file is present.
 */
export async function brandIcon(size: number, padding = 0.12) {
  let logo: string | null = null;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", "brand", "logo.png"));
    logo = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    logo = null;
  }
  const inner = Math.round(size * (1 - padding * 2));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#000000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={logo} width={inner} height={inner} style={{ objectFit: "contain", width: inner, height: inner }} />
        ) : (
          <svg viewBox="0 0 64 64" width={inner} height={inner}>
            <rect width="64" height="64" rx="14" fill="#1fcf57" />
            <g fill="#000000">
              <ellipse cx="32" cy="41" rx="13" ry="11" />
              <ellipse cx="16.5" cy="27" rx="5" ry="6.5" transform="rotate(-20 16.5 27)" />
              <ellipse cx="26" cy="19" rx="5" ry="7" transform="rotate(-6 26 19)" />
              <ellipse cx="38" cy="19" rx="5" ry="7" transform="rotate(6 38 19)" />
              <ellipse cx="47.5" cy="27" rx="5" ry="6.5" transform="rotate(20 47.5 27)" />
            </g>
          </svg>
        )}
      </div>
    ),
    { width: size, height: size },
  );
}
