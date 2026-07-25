import { HomeLoadingSkeleton } from "@/components/mobile-app/AppRouteSkeletons";

export default function Loading() {
  return <div data-pwa-route-loading="true"><HomeLoadingSkeleton /></div>;
}
