export type CampaignMenuPositionInput = {
  triggerLeft: number;
  triggerRight: number;
  triggerTop: number;
  triggerBottom: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  gap?: number;
};

export function getCampaignMenuPosition({
  triggerRight,
  triggerTop,
  triggerBottom,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  margin = 10,
  gap = 6,
}: CampaignMenuPositionInput) {
  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
  const left = Math.min(
    Math.max(margin, triggerRight - menuWidth),
    maxLeft
  );
  const downwardTop = triggerBottom + gap;
  const opensDownward =
    downwardTop + menuHeight <= viewportHeight - margin;
  const top = opensDownward
    ? downwardTop
    : Math.max(margin, triggerTop - menuHeight - gap);
  return { left, top, opensDownward };
}

export function getNextCampaignMenuItemIndex(
  key: string,
  currentIndex: number,
  itemCount: number
) {
  if (itemCount <= 0) return null;
  if (key === "ArrowDown") return (currentIndex + 1) % itemCount;
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return null;
}
