import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iPhone home-screen icon
export default function AppleIcon() {
  return brandIcon(180, 0.1);
}
