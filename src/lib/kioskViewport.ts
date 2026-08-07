export const KIOSK_DESIGN_WIDTH = 1920;
export const KIOSK_DESIGN_HEIGHT = 1080;

export function calculateKioskViewportLayout(width: number, height: number) {
  const availableWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const availableHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  const scale = Math.min(
    availableWidth / KIOSK_DESIGN_WIDTH,
    availableHeight / KIOSK_DESIGN_HEIGHT
  );
  const scaledWidth = KIOSK_DESIGN_WIDTH * scale;
  const scaledHeight = KIOSK_DESIGN_HEIGHT * scale;

  return {
    scale,
    left: (availableWidth - scaledWidth) / 2,
    top: (availableHeight - scaledHeight) / 2,
    scaledWidth,
    scaledHeight,
  };
}
