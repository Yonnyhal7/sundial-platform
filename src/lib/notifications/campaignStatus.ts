export type PersistedCampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "sending"
  | "sent"
  | "partially_failed"
  | "failed"
  | "no_eligible_devices"
  | "partially_sent"
  | "cancelled";

export type CampaignAggregateState = {
  status: string;
  scheduled_for?: string | null;
  eligible_count: number;
  successful_count: number;
  failed_count: number;
  pending_count?: number;
  cancelled_count?: number;
  claim_token?: string | null;
  claimed_at?: string | null;
  delivery_resolution_required?: boolean;
  archived_at?: string | null;
};

export type CampaignDisplayStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "partially_failed"
  | "failed"
  | "no_eligible_devices"
  | "action_required"
  | "partially_sent"
  | "archived"
  | "cancelled";

export function getCampaignDisplayStatus(
  campaign: CampaignAggregateState,
  now = new Date()
): CampaignDisplayStatus {
  if (campaign.archived_at) return "archived";
  if (
    campaign.delivery_resolution_required &&
    (campaign.pending_count || 0) > 0 &&
    !campaign.claim_token &&
    !campaign.claimed_at
  ) {
    return "action_required";
  }
  if (
    (campaign.pending_count || 0) === 0 &&
    (campaign.cancelled_count || 0) > 0
  ) {
    return campaign.successful_count > 0 ? "partially_sent" : "cancelled";
  }
  if (campaign.status === "partially_sent") return "partially_sent";
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
  action_required: "Action Required",
  partially_sent: "Partially Sent",
  archived: "Archived",
  cancelled: "Cancelled",
};

export function getCampaignStatusLabel(status: CampaignDisplayStatus) {
  return STATUS_LABELS[status];
}

export function getCampaignDeliverySummary(campaign: CampaignAggregateState) {
  const status = getCampaignDisplayStatus({ ...campaign, archived_at: null });
  if (status === "no_eligible_devices") return "No eligible devices";
  if (status === "partially_failed") {
    return `${campaign.successful_count} delivered\n${campaign.failed_count} failed`;
  }
  if (status === "failed") return `${campaign.failed_count} failed`;
  if (status === "partially_sent") {
    return `${campaign.successful_count} delivered\n${campaign.cancelled_count || 0} cancelled`;
  }
  if (status === "cancelled" && (campaign.cancelled_count || 0) > 0) {
    return `${campaign.cancelled_count} cancelled`;
  }
  if (status === "sent") {
    return campaign.successful_count === campaign.eligible_count
      ? `Delivered to ${campaign.successful_count} devices`
      : `${campaign.successful_count} of ${campaign.eligible_count} delivered`;
  }
  return null;
}
