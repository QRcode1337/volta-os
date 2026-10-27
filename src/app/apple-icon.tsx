import { mascotIcon } from '@/lib/mascot-icon';

// iOS "Add to Home Screen" icon. iOS rounds the corners itself, so the background stays square.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return mascotIcon(180, 0.16);
}
