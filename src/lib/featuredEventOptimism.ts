export function getOptimisticFeaturedEventId(
  currentFeaturedId: string | null,
  eventId: string,
  featured: boolean
) {
  if (featured) return eventId;
  return currentFeaturedId === eventId ? null : currentFeaturedId;
}

export function reconcileFeaturedEventId({
  previousFeaturedId,
  optimisticFeaturedId,
  succeeded,
}: {
  previousFeaturedId: string | null;
  optimisticFeaturedId: string | null;
  succeeded: boolean;
}) {
  return succeeded ? optimisticFeaturedId : previousFeaturedId;
}
