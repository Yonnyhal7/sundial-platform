import type { SchoolSetupEmailProvider } from "@/lib/platformSettings";

export type EmailDeliverySelection = {
  active: SchoolSetupEmailProvider;
  selected: SchoolSetupEmailProvider;
};

export function initialEmailDeliverySelection(
  active: SchoolSetupEmailProvider
): EmailDeliverySelection {
  return { active, selected: active };
}

export function selectEmailDeliveryProvider(
  state: EmailDeliverySelection,
  selected: SchoolSetupEmailProvider
): EmailDeliverySelection {
  return { ...state, selected };
}

export function reconcileEmailDeliverySelection(
  state: EmailDeliverySelection,
  active: SchoolSetupEmailProvider
): EmailDeliverySelection {
  return state.active === active ? state : { active, selected: active };
}

export function isEmailDeliverySelectionDirty(state: EmailDeliverySelection) {
  return state.selected !== state.active;
}
