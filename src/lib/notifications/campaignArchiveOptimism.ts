export function removeCampaignAtId<T extends { id: string }>(
  campaigns: T[],
  campaignId: string
) {
  const index = campaigns.findIndex((campaign) => campaign.id === campaignId);
  if (index < 0) return null;
  return {
    campaign: campaigns[index],
    index,
    campaigns: campaigns.filter((campaign) => campaign.id !== campaignId),
  };
}

export function restoreCampaignAtIndex<T extends { id: string }>(
  campaigns: T[],
  campaign: T,
  index: number
) {
  if (campaigns.some((item) => item.id === campaign.id)) return campaigns;
  const restored = [...campaigns];
  restored.splice(Math.min(Math.max(index, 0), restored.length), 0, campaign);
  return restored;
}
