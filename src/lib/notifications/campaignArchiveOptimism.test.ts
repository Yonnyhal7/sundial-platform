import { describe, expect, it } from "vitest";
import {
  removeCampaignAtId,
  restoreCampaignAtIndex,
} from "./campaignArchiveOptimism";

const campaigns = [
  { id: "first", title: "First" },
  { id: "middle", title: "Middle" },
  { id: "last", title: "Last" },
];

describe("notification campaign archive optimism", () => {
  it("removes the selected campaign and records its original position", () => {
    expect(removeCampaignAtId(campaigns, "middle")).toEqual({
      campaign: campaigns[1],
      index: 1,
      campaigns: [campaigns[0], campaigns[2]],
    });
  });

  it("restores a failed archive at its original position", () => {
    const removed = removeCampaignAtId(campaigns, "middle");
    expect(removed).not.toBeNull();
    expect(
      restoreCampaignAtIndex(
        removed!.campaigns,
        removed!.campaign,
        removed!.index
      )
    ).toEqual(campaigns);
  });

  it("does nothing when a campaign is already absent", () => {
    expect(removeCampaignAtId(campaigns, "missing")).toBeNull();
  });
});
