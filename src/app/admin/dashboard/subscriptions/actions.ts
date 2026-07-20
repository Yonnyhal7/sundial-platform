"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import { isUuid, LEDGER_TYPES, parseUsdToCents, PLAN_CODES, SUBSCRIPTION_STATUSES, validDateRange } from "@/lib/subscriptions";

export type SubscriptionActionState = { status: "idle" | "success" | "validation_error" | "stale" | "server_error"; message?: string };
export const INITIAL_SUBSCRIPTION_STATE: SubscriptionActionState = { status: "idle" };
type RpcResult = { status?: string };
const date = (value: FormDataEntryValue | null) => { const result = String(value || ""); return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null; };

function result(data: RpcResult | null, error: unknown, success: string): SubscriptionActionState {
  if (error || !data) return { status: "server_error", message: "Sundial could not complete that billing action." };
  if (data.status === "success") return { status: "success", message: success };
  if (data.status === "stale") return { status: "stale", message: "This subscription changed elsewhere. Reload before saving." };
  const messages: Record<string, string> = { founder_full: "All five Founder slots have been claimed.", plan_unavailable: "That plan is unavailable for new assignments.", invalid_dates: "Renewal date must be after the start date.", invalid_pricing: "Enter valid contracted pricing.", reason_required: "A reason is required for this action.", invalid_amount: "Enter an amount greater than zero.", not_found: "That billing record no longer exists.", permission_error: "You are not authorized to perform this action." };
  return { status: "validation_error", message: messages[data.status || ""] || "Review the submitted billing information." };
}

export async function assignSubscription(_state: SubscriptionActionState, formData: FormData): Promise<SubscriptionActionState> {
  const { supabase } = await requireSuperAdminAccess();
  const schoolId = String(formData.get("school_id") || ""); const plan = String(formData.get("plan_code") || "");
  const start = date(formData.get("start_date")); const renewal = date(formData.get("next_renewal_date"));
  if (!isUuid(schoolId) || !PLAN_CODES.includes(plan as never)) return { status: "validation_error", message: "Choose a valid school and plan." };
  if (!validDateRange(start, renewal)) return { status: "validation_error", message: "Renewal date must be after start date." };
  const setup = parseUsdToCents(String(formData.get("setup_fee") || "0")); const annual = parseUsdToCents(String(formData.get("annual_price") || "0"));
  if (setup === null || annual === null) return { status: "validation_error", message: "Enter valid USD amounts." };
  const { data, error } = await supabase.rpc("assign_school_subscription", { p_school_id: schoolId, p_plan_code: plan, p_setup_fee_cents: setup, p_annual_price_cents: annual, p_start_date: start, p_next_renewal_date: renewal }).single<RpcResult>();
  const state = result(data, error, "Subscription saved."); if (state.status === "success") revalidatePath("/admin/dashboard/subscriptions", "layout"); return state;
}

export async function updateSubscription(_state: SubscriptionActionState, formData: FormData): Promise<SubscriptionActionState> {
  const { supabase } = await requireSuperAdminAccess();
  const id = String(formData.get("subscription_id") || ""); const status = String(formData.get("status") || ""); const version = Number(formData.get("version"));
  const start = date(formData.get("start_date")); const renewal = date(formData.get("next_renewal_date"));
  if (!isUuid(id) || !SUBSCRIPTION_STATUSES.includes(status as never) || !Number.isSafeInteger(version)) return { status: "validation_error", message: "Invalid subscription update." };
  const email = String(formData.get("billing_contact_email") || "").trim(); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "validation_error", message: "Enter a valid billing email." };
  const { data, error } = await supabase.rpc("update_school_subscription", { p_subscription_id: id, p_expected_version: version, p_status: status, p_start_date: start, p_next_renewal_date: renewal, p_cancel_at_renewal: formData.get("cancel_at_renewal") === "on", p_cancellation_reason: String(formData.get("cancellation_reason") || "").slice(0, 500), p_billing_contact_name: String(formData.get("billing_contact_name") || "").slice(0, 120), p_billing_contact_email: email.slice(0, 254), p_billing_contact_phone: String(formData.get("billing_contact_phone") || "").slice(0, 40), p_internal_notes: String(formData.get("internal_notes") || "").slice(0, 2000) }).single<RpcResult>();
  const state = result(data, error, "Subscription details saved."); if (state.status === "success") revalidatePath("/admin/dashboard/subscriptions", "layout"); return state;
}

export async function recordLedgerEntry(_state: SubscriptionActionState, formData: FormData): Promise<SubscriptionActionState> {
  const { supabase } = await requireSuperAdminAccess();
  const id = String(formData.get("subscription_id") || ""); const type = String(formData.get("entry_type") || ""); const amount = parseUsdToCents(String(formData.get("amount") || ""));
  if (!isUuid(id) || !LEDGER_TYPES.includes(type as never) || amount === null) return { status: "validation_error", message: "Enter a valid ledger entry." };
  const direction = ["setup_fee_charge", "annual_charge", "custom_charge", "refund"].includes(type) ? "debit" : String(formData.get("direction") || "credit");
  const { data, error } = await supabase.rpc("record_subscription_ledger_entry", { p_subscription_id: id, p_entry_type: type, p_direction: direction, p_amount_cents: amount, p_status: String(formData.get("status") || ""), p_due_date: date(formData.get("due_date")), p_effective_date: date(formData.get("effective_date")), p_external_reference: String(formData.get("external_reference") || "").slice(0, 120), p_internal_note: String(formData.get("internal_note") || "").slice(0, 1000), p_reason: String(formData.get("reason") || "").slice(0, 500), p_related_entry_id: null, p_idempotency_key: String(formData.get("idempotency_key") || crypto.randomUUID()).slice(0, 120) }).single<RpcResult>();
  const state = result(data, error, "Ledger entry recorded."); if (state.status === "success") revalidatePath("/admin/dashboard/subscriptions", "layout"); return state;
}

export async function updatePlanTemplate(_state: SubscriptionActionState, formData: FormData): Promise<SubscriptionActionState> {
  const { supabase } = await requireSuperAdminAccess(); const code = String(formData.get("code") || ""); const version = Number(formData.get("version"));
  const setup = parseUsdToCents(String(formData.get("setup_fee") || "0")); const annual = parseUsdToCents(String(formData.get("annual_price") || "0"));
  if (!PLAN_CODES.includes(code as never) || !Number.isSafeInteger(version) || setup === null || annual === null) return { status: "validation_error", message: "Enter valid plan details." };
  const { data, error } = await supabase.rpc("update_subscription_plan_template", { p_code: code, p_expected_version: version, p_display_name: String(formData.get("display_name") || "").slice(0, 80), p_description: String(formData.get("description") || "").slice(0, 300), p_setup_fee_cents: setup, p_annual_price_cents: annual, p_active: formData.get("active_for_assignment") === "on" }).single<RpcResult>();
  const state = result(data, error, "Plan template saved. Existing contracts were not changed."); if (state.status === "success") revalidatePath("/admin/dashboard/subscriptions", "layout"); return state;
}
