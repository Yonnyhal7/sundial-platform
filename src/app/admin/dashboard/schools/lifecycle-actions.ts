"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import {
  confirmationMatches,
  dedupeStorageManifest,
  isTenantScopedStorageObject,
  storageObjectFromPublicUrl,
  type SchoolLifecycleState,
  type SchoolStorageObject,
} from "@/lib/schoolLifecycle";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

type LifecycleSchool = {
  id: string;
  name: string;
  subdomain: string;
  archived_at: string | null;
  logo_url: string | null;
};

type CleanupJob = {
  id: string;
  deleted_school_id: string;
  deleted_school_subdomain: string;
  deletion_audit_id: string | null;
  storage_manifest: unknown;
  status: string;
};

const CLEANUP_JOB_SELECT =
  "id, deleted_school_id, deleted_school_subdomain, deletion_audit_id, storage_manifest, status";

type RpcResult = {
  status?: string;
  message?: string;
  code?: string;
  constraint?: string;
  table?: string;
  databaseObject?: string;
};

function safeDatabaseFailure(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown; details?: unknown })
      : {};
  const text = [value.message, value.details]
    .filter((item): item is string => typeof item === "string")
    .join(" ");
  const identifier = text.match(
    /\b(?:constraint|table|relation)\s+"?([a-z_][a-z0-9_$.]{0,127})"?/i,
  )?.[1];
  return {
    code:
      typeof value.code === "string" && /^[A-Z0-9_]{3,20}$/i.test(value.code)
        ? value.code
        : "unknown",
    databaseObject: identifier || "unknown",
  };
}

function logDeletionStage(stage: string, detail?: Record<string, string>) {
  console.info("[School deletion]", { stage, ...detail });
}

function field(formData: FormData, name: string) {
  return String(formData.get(name) || "");
}

async function getLifecycleSchool(id: string) {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("schools")
    .select("id, name, subdomain, archived_at, logo_url")
    .eq("id", id)
    .maybeSingle<LifecycleSchool>();

  if (error) throw new Error(error.message);
  return data;
}

function targetMatches(school: LifecycleSchool, formData: FormData) {
  return (
    school.name === field(formData, "expectedName") &&
    school.subdomain === field(formData, "expectedSubdomain")
  );
}

function lifecycleMessage(status: string | undefined, verb: string) {
  if (status === "permission_error")
    return "Only an authenticated SuperAdmin can perform this action.";
  if (status === "stale_target")
    return "The school changed after this page loaded. Refresh and try again.";
  if (status === "school_not_archived")
    return "The school must be archived before it can be deleted.";
  return `Could not ${verb} the school. Refresh and try again.`;
}

function invalidateSchool(subdomain: string) {
  updateTag("mobile-app-schools");
  updateTag("mobile-app-quick-links");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/dashboard/schools");
  revalidatePath(`/${subdomain}`, "layout");
}

export async function archiveSchoolAction(
  _previousState: SchoolLifecycleState,
  formData: FormData,
): Promise<SchoolLifecycleState> {
  const { supabase } = await requireSuperAdminAccess();
  const schoolId = field(formData, "schoolId");
  const school = await getLifecycleSchool(schoolId);
  if (!school || !targetMatches(school, formData)) {
    return {
      status: "error",
      message: "The selected school no longer matches this page.",
    };
  }
  if (
    !confirmationMatches(
      field(formData, "confirmation"),
      school.name,
      school.subdomain,
    )
  ) {
    return {
      status: "error",
      message: "Type the exact school name or slug to confirm.",
    };
  }

  const { data, error } = await supabase.rpc("archive_school", {
    p_school_id: school.id,
    p_expected_name: school.name,
    p_expected_subdomain: school.subdomain,
  });
  if (error) return { status: "error", message: error.message };
  const result = data as RpcResult;
  if (result.status !== "success" && result.status !== "already_archived") {
    return {
      status: "error",
      message: lifecycleMessage(result.status, "archive"),
    };
  }

  invalidateSchool(school.subdomain);
  return {
    status: "success",
    message: `${school.name} is archived and unavailable.`,
  };
}

export async function restoreSchoolAction(
  _previousState: SchoolLifecycleState,
  formData: FormData,
): Promise<SchoolLifecycleState> {
  const { supabase } = await requireSuperAdminAccess();
  const school = await getLifecycleSchool(field(formData, "schoolId"));
  if (!school || !targetMatches(school, formData)) {
    return {
      status: "error",
      message: "The selected school no longer matches this page.",
    };
  }
  if (
    !confirmationMatches(
      field(formData, "confirmation"),
      school.name,
      school.subdomain,
    )
  ) {
    return {
      status: "error",
      message: "Type the exact school name or slug to confirm.",
    };
  }

  const { data, error } = await supabase.rpc("restore_school", {
    p_school_id: school.id,
    p_expected_name: school.name,
    p_expected_subdomain: school.subdomain,
  });
  if (error) return { status: "error", message: error.message };
  const result = data as RpcResult;
  if (result.status !== "success" && result.status !== "already_active") {
    return {
      status: "error",
      message: lifecycleMessage(result.status, "restore"),
    };
  }

  invalidateSchool(school.subdomain);
  return { status: "success", message: `${school.name} has been restored.` };
}

async function referencedStorageObjects(school: LifecycleSchool) {
  const service = createSupabaseServiceRoleClient();
  const objects: SchoolStorageObject[] = [];
  const urls = new Set<string>();
  if (school.logo_url) urls.add(school.logo_url);

  for (const table of ["resources", "announcements", "events"] as const) {
    const column = table === "resources" ? "file_url" : "image_url";
    const { data, error } = await service
      .from(table)
      .select(column)
      .eq("school_id", school.id);
    if (error && error.code !== "42703") throw new Error(error.message);
    for (const row of data || []) {
      const value = (row as Record<string, string | null>)[column];
      if (value) urls.add(value);
    }
  }

  for (const url of urls) {
    const object = storageObjectFromPublicUrl(url);
    if (!object) continue;
    if (isTenantScopedStorageObject(object, school.id)) {
      objects.push(object);
      continue;
    }

    const isLegacyLogo =
      object.bucket === "school-logos" &&
      object.path.startsWith(`logos/${school.subdomain}/`);
    const isLegacyResource =
      object.bucket === "resource-file" && object.path.startsWith("resources/");
    if (!isLegacyLogo && !isLegacyResource) continue;

    if ((await countStorageReferences(url, school.id)) === 0)
      objects.push(object);
  }

  for (const location of [
    { bucket: "school-logos", prefix: `schools/${school.id}/logos` },
    { bucket: "resource-file", prefix: `schools/${school.id}/resources` },
  ]) {
    let offset = 0;
    while (true) {
      const { data, error } = await service.storage
        .from(location.bucket)
        .list(location.prefix, { limit: 100, offset });
      if (error) throw new Error(`${location.bucket}: ${error.message}`);
      for (const item of data || []) {
        if (item.id)
          objects.push({
            bucket: location.bucket,
            path: `${location.prefix}/${item.name}`,
          });
      }
      if (!data || data.length < 100) break;
      offset += data.length;
    }
  }

  return dedupeStorageManifest(objects);
}

async function countStorageReferences(url: string, excludedSchoolId?: string) {
  const service = createSupabaseServiceRoleClient();
  let count = 0;
  for (const [table, column] of [
    ["schools", "logo_url"],
    ["resources", "file_url"],
    ["announcements", "image_url"],
    ["events", "image_url"],
  ] as const) {
    let query = service
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, url);
    if (excludedSchoolId) {
      query =
        table === "schools"
          ? query.neq("id", excludedSchoolId)
          : query.neq("school_id", excludedSchoolId);
    }
    const result = await query;
    if (
      result.error &&
      !["42703", "PGRST204"].includes(result.error.code || "")
    ) {
      throw new Error(result.error.message);
    }
    count += result.count || 0;
  }
  return count;
}

function isStorageManifest(value: unknown): value is SchoolStorageObject[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as SchoolStorageObject).bucket === "string" &&
        typeof (item as SchoolStorageObject).path === "string",
    )
  );
}

async function runStorageCleanup(job: CleanupJob) {
  const service = createSupabaseServiceRoleClient();
  if (!isStorageManifest(job.storage_manifest))
    throw new Error("Invalid cleanup manifest.");

  for (const object of job.storage_manifest) {
    if (isTenantScopedStorageObject(object, job.deleted_school_id)) continue;
    const legacyLogo =
      object.bucket === "school-logos" &&
      object.path.startsWith(`logos/${job.deleted_school_subdomain}/`);
    const legacyResource =
      object.bucket === "resource-file" && object.path.startsWith("resources/");
    if (!legacyLogo && !legacyResource)
      throw new Error("Cleanup manifest contains an unowned path.");
    const publicUrl = service.storage
      .from(object.bucket)
      .getPublicUrl(object.path).data.publicUrl;
    if ((await countStorageReferences(publicUrl)) > 0) {
      throw new Error(
        "A legacy file is now referenced by another school and was not deleted.",
      );
    }
  }

  for (const bucket of [
    ...new Set(job.storage_manifest.map((item) => item.bucket)),
  ]) {
    const paths = job.storage_manifest
      .filter((item) => item.bucket === bucket)
      .map((item) => item.path);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await service.storage
        .from(bucket)
        .remove(paths.slice(index, index + 100));
      if (error) throw new Error(`${bucket}: ${error.message}`);
    }
  }

  const now = new Date().toISOString();
  const { error } = await service
    .from("school_storage_cleanup_jobs")
    .update({
      status: "completed",
      storage_manifest: [],
      last_error: null,
      updated_at: now,
      completed_at: now,
    })
    .eq("id", job.id);
  if (error) throw new Error(error.message);
  if (job.deletion_audit_id) {
    await service
      .from("school_deletion_audits")
      .update({ outcome: "completed", completed_at: now, detail: null })
      .eq("id", job.deletion_audit_id);
  }
}

async function markStorageFailure(job: CleanupJob, error: unknown) {
  const service = createSupabaseServiceRoleClient();
  const message =
    error instanceof Error
      ? error.message.slice(0, 1000)
      : "Storage cleanup failed.";
  await service
    .from("school_storage_cleanup_jobs")
    .update({
      status: "storage_failed",
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (job.deletion_audit_id) {
    await service
      .from("school_deletion_audits")
      .update({ outcome: "storage_failed", detail: message })
      .eq("id", job.deletion_audit_id);
  }
}

export async function permanentlyDeleteSchoolAction(
  _previousState: SchoolLifecycleState,
  formData: FormData,
): Promise<SchoolLifecycleState> {
  logDeletionStage("server_action_entered");
  let access: Awaited<ReturnType<typeof requireSuperAdminAccess>>;
  try {
    access = await requireSuperAdminAccess();
  } catch {
    console.warn("[School deletion]", {
      stage: "authorization_failed",
      reason: "superadmin_required",
    });
    return {
      status: "error",
      reason: "authorization_failure",
      message:
        "Only an authenticated SuperAdmin can permanently delete a school.",
    };
  }
  const { supabase, profile } = access;
  let school: LifecycleSchool | null;
  try {
    school = await getLifecycleSchool(field(formData, "schoolId"));
  } catch (error) {
    console.error("[School deletion]", {
      stage: "target_lookup_failed",
      ...safeDatabaseFailure(error),
    });
    return {
      status: "error",
      reason: "database_failure",
      message:
        "The school could not be verified for deletion. No school data was removed.",
    };
  }
  if (!school || !targetMatches(school, formData)) {
    return {
      status: "error",
      reason: "validation_failure",
      message: "The selected school no longer matches this page.",
    };
  }
  if (!school.archived_at) {
    return {
      status: "error",
      reason: "validation_failure",
      message: "Archive this school before deleting it.",
    };
  }
  if (
    !confirmationMatches(
      field(formData, "confirmation"),
      school.name,
      school.subdomain,
    )
  ) {
    return {
      status: "error",
      reason: "validation_failure",
      message: "Type the exact school name or slug to confirm.",
    };
  }
  if (field(formData, "irreversible") !== "yes") {
    return {
      status: "error",
      reason: "validation_failure",
      message: "Confirm that permanent deletion is irreversible.",
    };
  }

  const service = createSupabaseServiceRoleClient();
  let manifest: SchoolStorageObject[];
  try {
    manifest = await referencedStorageObjects(school);
  } catch (error) {
    console.error("[School deletion]", {
      stage: "storage_manifest_failed",
      ...safeDatabaseFailure(error),
    });
    return {
      status: "error",
      reason: "storage_cleanup_failure",
      message:
        "Stored files could not be prepared for safe cleanup. No school data was deleted.",
    };
  }
  const { data: existingJob, error: existingJobError } = await service
    .from("school_storage_cleanup_jobs")
    .select(CLEANUP_JOB_SELECT)
    .eq("deleted_school_id", school.id)
    .in("status", ["database_pending", "database_failed"])
    .maybeSingle<CleanupJob>();
  if (existingJobError) {
    console.error("[School deletion]", {
      stage: "cleanup_job_lookup_failed",
      ...safeDatabaseFailure(existingJobError),
    });
    return {
      status: "error",
      reason: "database_failure",
      message:
        "The deletion transaction could not be prepared. No school data was deleted.",
    };
  }
  let job = existingJob;
  if (!job) {
    const insertResult = await service
      .from("school_storage_cleanup_jobs")
      .insert({
        deleted_school_id: school.id,
        deleted_school_name: school.name,
        deleted_school_subdomain: school.subdomain,
        requested_by: profile.id,
        storage_manifest: manifest,
      })
      .select(CLEANUP_JOB_SELECT)
      .single<CleanupJob>();
    job = insertResult.data;
    if (insertResult.error?.code === "23505") {
      const retry = await service
        .from("school_storage_cleanup_jobs")
        .select(CLEANUP_JOB_SELECT)
        .eq("deleted_school_id", school.id)
        .in("status", ["database_pending", "database_failed"])
        .single<CleanupJob>();
      job = retry.data;
    } else if (insertResult.error) {
      console.error("[School deletion]", {
        stage: "cleanup_job_failed",
        ...safeDatabaseFailure(insertResult.error),
      });
      return {
        status: "error",
        reason: "database_failure",
        message:
          "The deletion transaction could not be prepared. No school data was deleted.",
      };
    }
  }
  if (!job) {
    return {
      status: "error",
      reason: "database_failure",
      message:
        "The deletion transaction could not be prepared. No school data was deleted.",
    };
  }

  logDeletionStage("deletion_transaction_started");
  const { data, error } = await supabase.rpc(
    "permanently_delete_archived_school",
    {
      p_school_id: school.id,
      p_expected_name: school.name,
      p_expected_subdomain: school.subdomain,
      p_cleanup_job_id: job.id,
    },
  );
  const result = data as RpcResult | null;
  if (error || result?.status !== "success") {
    const { data: failedJob } = await service
      .from("school_storage_cleanup_jobs")
      .select("last_error")
      .eq("id", job.id)
      .maybeSingle<{ last_error: string | null }>();
    const resultFailure =
      !error && result
        ? {
            code:
              typeof result.code === "string" &&
              /^[A-Z0-9_]{3,20}$/i.test(result.code)
                ? result.code
                : "unknown",
            databaseObject:
              [result.constraint, result.table, result.databaseObject].find(
                (value) =>
                  typeof value === "string" &&
                  /^[a-z_][a-z0-9_$.,]{0,499}$/i.test(value),
              ) || "unknown",
          }
        : safeDatabaseFailure(error || { message: failedJob?.last_error });
    console.error("[School deletion]", {
      stage: "database_deletion_failed",
      reason: result?.status || "rpc_error",
      ...resultFailure,
    });
    return {
      status: "error",
      reason:
        result?.status === "permission_error"
          ? "authorization_failure"
          : "database_failure",
      message:
        result?.status === "permission_error"
          ? "Only an authenticated SuperAdmin can permanently delete a school."
          : "The database deletion failed. No school data was removed.",
    };
  }

  const { data: updatedJob } = await service
    .from("school_storage_cleanup_jobs")
    .select(CLEANUP_JOB_SELECT)
    .eq("id", job.id)
    .single<CleanupJob>();
  try {
    await runStorageCleanup(updatedJob || job);
  } catch (cleanupError) {
    await markStorageFailure(updatedJob || job, cleanupError);
    invalidateSchool(school.subdomain);
    return {
      status: "warning",
      reason: "storage_cleanup_failure",
      message: `${school.name} was deleted. Some stored files remain; use Retry cleanup below.`,
    };
  }

  invalidateSchool(school.subdomain);
  return {
    status: "success",
    reason: "success",
    message: `${school.name} was permanently deleted.`,
  };
}

export async function retrySchoolStorageCleanupAction(formData: FormData) {
  await requireSuperAdminAccess();
  const service = createSupabaseServiceRoleClient();
  const { data: job, error } = await service
    .from("school_storage_cleanup_jobs")
    .select(CLEANUP_JOB_SELECT)
    .eq("id", field(formData, "jobId"))
    .in("status", ["database_deleted", "storage_failed"])
    .maybeSingle<CleanupJob>();
  if (error || !job) return;

  try {
    await runStorageCleanup(job);
  } catch (cleanupError) {
    await markStorageFailure(job, cleanupError);
  }
  revalidatePath("/admin/dashboard/schools");
}
