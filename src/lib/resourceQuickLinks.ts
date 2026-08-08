export const QUICK_LINK_GUIDANCE_THRESHOLD = 8;

export type QuickLinkResource = {
  id: string;
  title: string;
  url: string | null;
  file_url: string | null;
  is_quick_link: boolean;
};

export function getOptimisticQuickLinkIds(
  currentIds: string[],
  resourceId: string,
  selected: boolean
) {
  const ids = new Set(currentIds);
  if (selected) ids.add(resourceId);
  else ids.delete(resourceId);
  return Array.from(ids);
}

export function reconcileQuickLinkIds({
  previousIds,
  optimisticIds,
  succeeded,
}: {
  previousIds: string[];
  optimisticIds: string[];
  succeeded: boolean;
}) {
  return succeeded ? optimisticIds : previousIds;
}

export function resourceQuickLinks(
  resources: QuickLinkResource[],
  school: string
) {
  return resources
    .filter((resource) => resource.is_quick_link)
    .map((resource) => ({
      title: resource.title,
      href: resource.url || resource.file_url || `/${school}/app/resources`,
    }));
}
