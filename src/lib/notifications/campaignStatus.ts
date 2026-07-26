export type PersistedCampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "sending"
  | "sent"
  | "partially_failed"
  | "failed"
  | "no_eligible_devices"
  | "cancelled";

export type CampaignAggregateState = {
  status: string;
  scheduled_for?: string | null;
  eligible_count: number;
  successful_count: number;
  failed_count: number;
};

export type CampaignDisplayStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "partially_failed"
  | "failed"
  | "no_eligible_devices"
  | "cancelled";

export function getCampaignDisplayStatus(
  campaign: CampaignAggregateState,
  now = new Date()
): CampaignDisplayStatus {
  if (campaign.status === "cancelled") return "cancelled";
  if (campaign.status === "draft") return "draft";
  if (
    campaign.status === "scheduled" &&
    campaign.scheduled_for &&
    new Date(campaign.scheduled_for).getTime() > now.getTime()
  ) {
    return "scheduled";
  }
  if (["scheduled", "queued", "sending"].includes(campaign.status)) {
    return "sending";
  }
  if (campaign.eligible_count === 0) return "no_eligible_devices";
  if (campaign.successful_count > 0 && campaign.failed_count > 0) {
    return "partially_failed";
  }
  if (campaign.successful_count === 0 && campaign.failed_count > 0) {
    return "failed";
  }
  if (campaign.successful_count > 0 && campaign.failed_count === 0) {
    return "sent";
  }
  return "sending";
}

const STATUS_LABELS: Record<CampaignDisplayStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  partially_failed: "Partially Failed",
  failed: "Failed",
  no_eligible_devices: "No Eligible Devices",
  cancelled: "Cancelled",
};

export function getCampaignStatusLabel(status: CampaignDisplayStatus) {
  return STATUS_LABELS[status];
}

export function getCampaignDeliverySummary(campaign: CampaignAggregateState) {
  const status = getCampaignDisplayStatus(campaign);
  if (status === "no_eligible_devices") return "No eligible devices";
  if (status === "partially_failed") {
    return `${campaign.successful_count} delivered\n${campaign.failed_count} failed`;
  }
  if (status === "failed") return `${campaign.failed_count} failed`;
  if (status === "sent") {
    return campaign.successful_count === campaign.eligible_count
      ? `Delivered to ${campaign.successful_count} devices`
      : `${campaign.successful_count} of ${campaign.eligible_count} delivered`;
  }
  return null;
}
