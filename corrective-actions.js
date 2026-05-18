/**
 * corrective-actions.js
 * Shared module for the Corrective Actions Management System.
 * Imported by baltimar.js, revey.js, and my-actions.html.
 */

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js";
import { compressImage } from "./utils.js";

// ── STATUS HELPERS ─────────────────────────────────────────────────────────────

/** "3" = Unsatisfactory (non-Safety), "non" = Non (Safety audits) */
export function isNonSatisfactory(statusValue) {
  return statusValue === "3" || statusValue === "non";
}

/** Determines if a CA form should be shown — includes "na" (Non applicable) for safety audits */
export function requiresCA(statusValue) {
  return statusValue === "3" || statusValue === "non" || statusValue === "na";
}

/**
 * Compute the display status, auto-promoting to "Late" when past due_date
 * and not yet closed.
 */
export function computeEffectiveStatus(dbStatus, dueDate) {
  if (dbStatus === "Closed") return "Closed";
  if (!dueDate) return dbStatus || "Open";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today ? "Late" : (dbStatus || "Open");
}

const STATUS_CFG = {
  "Open":        { color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  label: "Open" },
  "In Progress": { color: "#f97316", bg: "rgba(249,115,22,0.12)",  label: "In Progress" },
  "Late":        { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "Late" },
  "Closed":      { color: "#10b981", bg: "rgba(16,185,129,0.12)",  label: "Closed" },
};

export function getStatusCfg(status) {
  return STATUS_CFG[status] || { color: "#64748b", bg: "rgba(100,116,139,0.12)", label: status };
}

// ── SUPABASE QUERIES ──────────────────────────────────────────────────────────

export async function loadResponsables() {
  const { data, error } = await supabase
    .from("authorized_users")
    .select("username")
    .order("username");
  if (error) { console.error("loadResponsables:", error); return []; }
  return (data || []).map(u => u.username);
}

export async function loadCorrectiveActionsForSession(sessionId) {
  if (!sessionId) return [];
  const { data, error } = await supabase
    .from("corrective_actions")
    .select("*")
    .eq("session_id", sessionId);
  if (error) { console.error("loadCAForSession:", error); return []; }
  return data || [];
}

export async function loadMyCorrectiveActions(username) {
  const { data, error } = await supabase
    .from("corrective_actions")
    .select("*")
    .eq("responsable", username)
    .order("date_created", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadAllCorrectiveActions() {
  const { data, error } = await supabase
    .from("corrective_actions")
    .select("*")
    .order("date_created", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveCorrectiveAction(caData) {
  const { id, ...fields } = caData;
  if (id) {
    const { data, error } = await supabase
      .from("corrective_actions")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("corrective_actions")
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCorrectiveActionStatus(id, fields) {
  const { data, error } = await supabase
    .from("corrective_actions")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── STORAGE ───────────────────────────────────────────────────────────────────

export async function uploadClosureEvidence(file) {
  const compressed = await compressImage(file, 1600, 0.75);
  const ext = (compressed.name.split(".").pop() || "jpg").toLowerCase();
  const filePath = `closure/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("corrective-actions")
    .upload(filePath, compressed, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage
    .from("corrective-actions")
    .getPublicUrl(filePath);
  return data.publicUrl;
}

// ── AUDIT-SIDE FORM ROW ───────────────────────────────────────────────────────

/**
 * Build a <tr class="ca-form-row"> that is inserted after a question row.
 * Returns the <tr> element; call .classList.remove("hidden") to show it.
 *
 * @param {object} opts
 *   colspan     {number}      - columns in the table (3 desktop / 4 mobile)
 *   existingCA  {object|null}
 *   sessionInfo {object}      - {sessionId, auditName, zone, sousZone, rubrique, question}
 *   createdBy   {string}      - auditor username
 */
export function createCAFormRow({ colspan, existingCA, sessionInfo, createdBy }) {
  const caRow = document.createElement("tr");
  caRow.className = "ca-form-row hidden";

  const td = document.createElement("td");
  td.colSpan = colspan;

  td.innerHTML = `
    <div class="ca-form-container">
      <div class="ca-form-header">
        <span class="ca-form-title">⚠️ Action Corrective Requise</span>
        <span class="ca-priority-badge ca-priority-${(existingCA?.priority || "Medium").toLowerCase()}">${existingCA?.priority || "Medium"}</span>
      </div>
      <div class="ca-form-fields">
        <div class="ca-field-row">
          <div class="ca-field-group">
            <label class="ca-label">Responsable *</label>
            <select class="ca-input ca-responsable">
              <option value="">-- Choisir --</option>
              ${existingCA?.responsable ? `<option value="${existingCA.responsable}" selected>${existingCA.responsable}</option>` : ""}
            </select>
          </div>
          <div class="ca-field-group">
            <label class="ca-label">Priorité</label>
            <select class="ca-input ca-priority">
              <option value="Low"   ${existingCA?.priority === "Low"    ? "selected" : ""}>Low</option>
              <option value="Medium"${!existingCA?.priority || existingCA.priority === "Medium" ? " selected" : ""}>Medium</option>
              <option value="High"  ${existingCA?.priority === "High"   ? "selected" : ""}>High</option>
            </select>
          </div>
          <div class="ca-field-group">
            <label class="ca-label">Date limite *</label>
            <input type="date" class="ca-input ca-due-date" value="${existingCA?.due_date || ""}">
          </div>
        </div>
        <div class="ca-field-group ca-field-full">
          <label class="ca-label">Action corrective requise *</label>
          <textarea class="ca-input ca-action" rows="2" placeholder="Décrivez l'action corrective à réaliser…">${existingCA?.action_required || ""}</textarea>
        </div>
        <div class="ca-field-group ca-field-full">
          <label class="ca-label">Commentaire (facultatif)</label>
          <input type="text" class="ca-input ca-comment" placeholder="Commentaire optionnel…" value="${existingCA?.non_conformity_comment || ""}">
        </div>
        <div class="ca-form-actions">
          <button class="ca-save-btn" type="button">💾 Sauvegarder l'action</button>
          <span class="ca-status-msg"></span>
        </div>
      </div>
    </div>
  `;

  caRow.appendChild(td);

  let caId = existingCA?.id || null;
  const saveBtn       = td.querySelector(".ca-save-btn");
  const statusMsg     = td.querySelector(".ca-status-msg");
  const responsableEl = td.querySelector(".ca-responsable");
  const actionEl      = td.querySelector(".ca-action");
  const dueDateEl     = td.querySelector(".ca-due-date");
  const priorityEl    = td.querySelector(".ca-priority");
  const commentEl     = td.querySelector(".ca-comment");
  const priorityBadge = td.querySelector(".ca-priority-badge");

  // Populate responsable dropdown from DB
  loadResponsables().then(names => {
    const current = responsableEl.value;
    const existing = new Set(Array.from(responsableEl.options).map(o => o.value));
    names.forEach(name => {
      if (!existing.has(name)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        responsableEl.appendChild(opt);
      }
    });
    if (current) responsableEl.value = current;
  });

  // Sync priority badge color on change
  priorityEl.addEventListener("change", () => {
    priorityBadge.className = `ca-priority-badge ca-priority-${priorityEl.value.toLowerCase()}`;
    priorityBadge.textContent = priorityEl.value;
  });

  if (caId) {
    statusMsg.textContent = "✓ Action corrective déjà sauvegardée";
    statusMsg.style.color = "#10b981";
  }

  saveBtn.addEventListener("click", async () => {
    const responsable = responsableEl.value.trim();
    const action      = actionEl.value.trim();
    const dueDate     = dueDateEl.value;

    if (!responsable || !action || !dueDate) {
      alert("Veuillez remplir : Responsable, Action corrective et Date limite.");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "⏳ Sauvegarde…";
    statusMsg.textContent = "";

    try {
      const isNew = !caId;

      const payload = {
        ...(caId ? { id: caId } : {}),
        session_id:             sessionInfo.sessionId,
        audit_name:             sessionInfo.auditName,
        zone:                   sessionInfo.zone   || null,
        sous_zone:              sessionInfo.sousZone || null,
        rubrique:               sessionInfo.rubrique || null,
        question:               sessionInfo.question,
        non_conformity_comment: commentEl.value.trim() || null,
        responsable,
        action_required:        action,
        priority:               priorityEl.value,
        due_date:               dueDate,
        created_by:             createdBy,
        ...(!caId ? { status: "Open", date_created: new Date().toISOString() } : {}),
      };

      const result = await saveCorrectiveAction(payload);
      caId = result.id;

      // Notification email au responsable (nouvelle action uniquement)
      if (isNew) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || SUPABASE_ANON_KEY;

        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/notify-ca`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              responsable,
              action_required: action,
              due_date:        dueDate,
              priority:        priorityEl.value,
              zone:            sessionInfo.zone      || null,
              audit_name:      sessionInfo.auditName || null,
              question:        sessionInfo.question  || null,
              created_by:      createdBy             || null,
            }),
          });
          const data = await r.json();
          console.log("[notify-ca] status:", r.status, "| réponse:", JSON.stringify(data));
          if (!r.ok) {
            console.error("[notify-ca] ❌ Échec →", data?.error || r.status);
            statusMsg.textContent = `✓ Sauvegardé — ⚠️ Email non envoyé : ${data?.error || r.status}`;
            statusMsg.style.color = "#f97316";
          } else {
            const emailOk = data?.results?.email?.ok;
            if (emailOk === false) {
              console.warn("[notify-ca] ⚠️ Fonction OK mais email non livré →", JSON.stringify(data.results));
            } else if (emailOk === undefined) {
              console.warn("[notify-ca] ⚠️ Aucun email trouvé pour ce responsable →", JSON.stringify(data));
            } else {
              console.log("[notify-ca] ✅ Email envoyé →", JSON.stringify(data.results));
            }
            statusMsg.textContent = "✓ Sauvegardé — Email envoyé";
            statusMsg.style.color = "#10b981";
          }
        } catch (e) {
          console.error("[notify-ca] ❌ Erreur réseau →", e.message);
          statusMsg.textContent = `✓ Sauvegardé — ⚠️ Email non envoyé : ${e.message}`;
          statusMsg.style.color = "#f97316";
        }
      }

      saveBtn.disabled = false;
      saveBtn.textContent = "💾 Sauvegarder l'action";
      if (!isNew) {
        statusMsg.textContent = "✓ Sauvegardé avec succès";
        statusMsg.style.color = "#10b981";
      }
      setTimeout(() => { statusMsg.textContent = ""; }, 5000);
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 Sauvegarder l'action";
      statusMsg.textContent = "✗ Erreur : " + (e.message || e);
      statusMsg.style.color = "#ef4444";
    }
  });

  return caRow;
}
