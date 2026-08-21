import type { SupabaseClient } from "@supabase/supabase-js";

export const CP_PDF_BUCKET = "commercial-proposals";

function isMissingStorageObject(message: string): boolean {
  return /not found|not_found|object not found|does not exist/i.test(message);
}

async function removeStoragePath(
  admin: SupabaseClient,
  objectPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.storage.from(CP_PDF_BUCKET).remove([objectPath]);
  if (!error || isMissingStorageObject(error.message)) return { ok: true };
  return { ok: false, error: error.message };
}

/**
 * Removes the proposal PDF (if any) from Storage, then deletes the
 * commercial_proposals row. Lines and discounts follow ON DELETE CASCADE.
 * Does not touch clients, leads, catalog, templates, or proposal counters.
 */
export async function deleteProposalStorageAndRow(
  admin: SupabaseClient,
  proposal: { id: string; pdf_storage_path?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(proposal.id ?? "").trim();
  if (!id) return { ok: false, error: "Pasiūlymas nerastas." };

  const paths = new Set<string>();
  if (proposal.pdf_storage_path) paths.add(String(proposal.pdf_storage_path));
  paths.add(`${id}/proposal.pdf`);

  const listed = await admin.storage.from(CP_PDF_BUCKET).list(id);
  if (!listed.error) {
    for (const obj of listed.data ?? []) {
      if (obj.name) paths.add(`${id}/${obj.name}`);
    }
  }

  for (const objectPath of paths) {
    const removed = await removeStoragePath(admin, objectPath);
    if (!removed.ok) return removed;
  }

  const { error } = await admin.from("commercial_proposals").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
