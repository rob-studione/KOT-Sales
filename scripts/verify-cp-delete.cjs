/**
 * Verify commercial proposal delete cleanup (DB cascade + Storage).
 * Does not increment CP counters. Creates and removes only CP-DELETE-TEST rows.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const wanted = new Set(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!raw || raw.startsWith("#")) continue;
    const eq = raw.indexOf("=");
    if (eq < 1) continue;
    const key = raw.slice(0, eq).trim();
    if (!wanted.has(key) || process.env[key] != null) continue;
    let val = raw.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function deleteProposalStorageAndRow(admin, proposal) {
  const id = String(proposal.id);
  const bucket = "commercial-proposals";
  const paths = new Set();
  if (proposal.pdf_storage_path) paths.add(String(proposal.pdf_storage_path));
  paths.add(`${id}/proposal.pdf`);
  const listed = await admin.storage.from(bucket).list(id);
  if (!listed.error) {
    for (const obj of listed.data ?? []) {
      if (obj.name) paths.add(`${id}/${obj.name}`);
    }
  }
  for (const objectPath of paths) {
    const { error: rmErr } = await admin.storage.from(bucket).remove([objectPath]);
    if (rmErr && !/not found|not_found|object not found|does not exist/i.test(rmErr.message)) {
      throw new Error(rmErr.message);
    }
  }
  const { error } = await admin.from("commercial_proposals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function countFor(admin, table, proposalId) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("proposal_id", proposalId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, "Missing Supabase env");
  console.log("connecting");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: source, error: sErr } = await admin
    .from("commercial_proposals")
    .select("client_key,client_id,company_code,client_name,recipient_type,recipient_id,recipient_name,contact_name,recipient_email,recipient_phone,sales_manager_id,created_by")
    .not("client_key", "is", null)
    .limit(1)
    .maybeSingle();
  console.log("source", sErr?.message ?? (source ? "ok" : "empty"));
  if (sErr || !source) throw new Error(sErr?.message ?? "No source proposal to copy recipient from");

  const { data: counterBefore, error: cErr } = await admin
    .from("commercial_proposal_counters")
    .select("year,last_number")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);

  const recipientSnapshot = {
    client_key: source.client_key,
    client_id: source.client_id,
    company_code: source.company_code,
    client_name: source.client_name,
    recipient_type: source.recipient_type || "client",
    recipient_id: source.recipient_id,
    recipient_name: source.recipient_name || source.client_name,
  };

  const { data: draft, error: dErr } = await admin
    .from("commercial_proposals")
    .insert({
      status: "draft",
      template_version: "LT_COMMERCIAL_V2",
      ...recipientSnapshot,
      client_name: "CP DELETE TEST draft",
      recipient_name: "CP DELETE TEST draft",
      sales_manager_id: source.sales_manager_id,
      created_by: source.created_by,
      global_discount_pct: 0,
    })
    .select("id")
    .single();
  if (dErr || !draft) throw new Error(dErr?.message ?? "draft insert failed");

  const { error: lErr } = await admin.from("commercial_proposal_lines").insert({
    proposal_id: draft.id,
    category: "translation",
    sort_order: 1,
    label: "CP DELETE TEST line",
    base_price: 10,
    calculated_price: 10,
    final_price: 10,
  });
  if (lErr) throw new Error(lErr.message);

  const { error: discErr } = await admin.from("commercial_proposal_discounts").insert({
    proposal_id: draft.id,
    category: "translation",
    percentage: 5,
  });
  if (discErr) throw new Error(discErr.message);

  assert((await countFor(admin, "commercial_proposal_lines", draft.id)) === 1, "draft line missing");
  assert((await countFor(admin, "commercial_proposal_discounts", draft.id)) === 1, "draft discount missing");

  await deleteProposalStorageAndRow(admin, { id: draft.id, pdf_storage_path: null });

  const { data: draftGone } = await admin.from("commercial_proposals").select("id").eq("id", draft.id).maybeSingle();
  assert(!draftGone, "draft row still exists");
  assert((await countFor(admin, "commercial_proposal_lines", draft.id)) === 0, "draft lines not cascaded");
  assert((await countFor(admin, "commercial_proposal_discounts", draft.id)) === 0, "draft discounts not cascaded");
  console.log("1-2. Draft without PDF deleted; lines and discounts removed.");

  const { data: generated, error: gErr } = await admin
    .from("commercial_proposals")
    .insert({
      status: "generated",
      proposal_number: `CP-DEL-TEST-${Date.now()}`,
      template_version: "LT_COMMERCIAL_V2",
      ...recipientSnapshot,
      client_name: "CP DELETE TEST generated",
      recipient_name: "CP DELETE TEST generated",
      sales_manager_id: source.sales_manager_id,
      created_by: source.created_by,
      generated_at: new Date().toISOString(),
    })
    .select("id,proposal_number")
    .single();
  if (gErr || !generated) throw new Error(gErr?.message ?? "generated insert failed");
  const genPath = `${generated.id}/proposal.pdf`;
  const { error: pathErr } = await admin
    .from("commercial_proposals")
    .update({ pdf_storage_path: genPath })
    .eq("id", generated.id);
  if (pathErr) throw new Error(pathErr.message);
  generated.pdf_storage_path = genPath;

  const { error: l2Err } = await admin.from("commercial_proposal_lines").insert({
    proposal_id: generated.id,
    category: "translation",
    sort_order: 1,
    label: "CP DELETE TEST generated line",
    base_price: 12,
    calculated_price: 12,
    final_price: 12,
  });
  if (l2Err) throw new Error(l2Err.message);

  const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
  const { error: upErr } = await admin.storage.from("commercial-proposals").upload(genPath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: beforePdf, error: beforePdfErr } = await admin.storage.from("commercial-proposals").download(genPath);
  if (beforePdfErr || !beforePdf) throw new Error(beforePdfErr?.message ?? "uploaded PDF missing");

  await deleteProposalStorageAndRow(admin, generated);

  const { data: genGone } = await admin.from("commercial_proposals").select("id").eq("id", generated.id).maybeSingle();
  assert(!genGone, "generated row still exists");
  assert((await countFor(admin, "commercial_proposal_lines", generated.id)) === 0, "generated lines not cascaded");

  const folder = generated.id;
  const listedAfter = await admin.storage.from("commercial-proposals").list(folder);
  if (listedAfter.error) throw new Error(listedAfter.error.message);
  const leftoverFiles = (listedAfter.data ?? []).filter((obj) => obj.name && obj.id);
  assert(leftoverFiles.length === 0, `PDF still listed in storage: ${leftoverFiles.map((f) => f.name).join(", ")}`);
  console.log("3-4. Generated test proposal deleted; PDF removed from storage.");

  const { data: counterAfter, error: c2Err } = await admin
    .from("commercial_proposal_counters")
    .select("year,last_number")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (c2Err) throw new Error(c2Err.message);
  assert(
    JSON.stringify(counterBefore) === JSON.stringify(counterAfter),
    `counter changed: ${JSON.stringify(counterBefore)} -> ${JSON.stringify(counterAfter)}`
  );
  console.log("5. Proposal numbering unchanged:", counterAfter);

  if (source.recipient_type === "lead" && source.recipient_id) {
    const { data: lead, error: leadErr } = await admin.from("project_manual_leads").select("id").eq("id", source.recipient_id).maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    assert(lead, "lead was deleted");
  }
  if (source.client_id) {
    const { count, error: clientErr } = await admin
      .from("v_client_list_from_invoices")
      .select("client_id", { count: "exact", head: true })
      .eq("client_id", source.client_id);
    if (clientErr) throw new Error(clientErr.message);
    assert((count ?? 0) > 0, "client disappeared");
  }
  const { count: catalogCount, error: catErr } = await admin.from("cp_price_items").select("id", { count: "exact", head: true });
  if (catErr) throw new Error(catErr.message);
  assert((catalogCount ?? 0) > 0, "price catalog empty after delete");
  console.log("6. Client/lead and catalog remain untouched.");
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
