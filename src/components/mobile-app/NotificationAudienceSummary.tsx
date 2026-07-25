import {
  getNotificationAudienceLabel,
  type NotificationAudience,
} from "@/lib/notifications";

export default function NotificationAudienceSummary({
  audience,
}: {
  audience: NotificationAudience | null;
}) {
  const label = audience ? getNotificationAudienceLabel(audience) : null;

  if (!label) {
    return (
      <div className="min-w-0 flex-1">
        <h2 className="text-2xl font-black">Notifications</h2>
        <p className="mt-1 text-sm font-semibold text-[color-mix(in_srgb,var(--school-primary-text)_76%,transparent)]">
          School communication
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <h2
        aria-label={`Notifications, ${label} device`}
        className="text-2xl font-black"
      >
        Notifications ({label})
      </h2>
      <p className="mt-1 text-sm font-semibold text-[color-mix(in_srgb,var(--school-primary-text)_82%,transparent)]">
        This device is configured for {label} notifications.
      </p>
      <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-[color-mix(in_srgb,var(--school-primary-text)_72%,transparent)]">
        This audience is saved for this browser and may remain if the Home Screen
        app is removed.
      </p>
    </div>
  );
}
