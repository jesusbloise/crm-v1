// server/lib/activityNotifications.js
const db = require("../db/connection");
const { sendMail } = require("./mailer");
const {
  linkedContactVisibilityFilter,
} = require("./contactAccess");

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function assigneeIds(activity) {
  return uniq([
    activity?.assigned_to,
    activity?.assigned_to_2,
  ]);
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  // PostgreSQL puede devolver BIGINT como string.
  const date = new Date(Number(value));

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("es-CL", {
        timeZone: "America/Santiago",
      });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Recupera el estado actual de la actividad y del destinatario.
 * No utiliza los datos del evento anterior para construir el correo.
 */
async function getAllowedDelivery(activityId, tenantId, recipientId) {
  if (!activityId || !tenantId || !recipientId) return null;

  const recipientReq = {
    tenantId,
    user: { id: recipientId },
    auth: { sub: recipientId },
  };

  const filter = linkedContactVisibilityFilter(recipientReq, "a");

  return db.prepare(`
    SELECT
      a.*,
      recipient.name AS recipient_name,
      recipient.email AS recipient_email,
      COALESCE(
        NULLIF(ct.name, ''),
        ct.email,
        NULLIF(dc.name, ''),
        dc.email,
        'Cliente sin nombre'
      ) AS contact_label
    FROM activities a
    JOIN users recipient
      ON recipient.id = ?
    LEFT JOIN contacts ct
      ON ct.id = a.contact_id
     AND ct.tenant_id = a.tenant_id
    LEFT JOIN deals d
      ON d.id = a.deal_id
     AND d.tenant_id = a.tenant_id
    LEFT JOIN contacts dc
      ON dc.id = d.contact_id
     AND dc.tenant_id = d.tenant_id
    WHERE a.id = ?
      AND a.tenant_id = ?
      AND (
        a.assigned_to = recipient.id
        OR a.assigned_to_2 = recipient.id
      )
      AND COALESCE(recipient.active, TRUE) = TRUE
      AND NULLIF(BTRIM(recipient.email), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM tenant_memberships tm
          WHERE tm.tenant_id = a.tenant_id
            AND tm.user_id = recipient.id
        )
        OR EXISTS (
          SELECT 1
          FROM memberships m
          WHERE m.tenant_id = a.tenant_id
            AND m.user_id = recipient.id
        )
        OR EXISTS (
          SELECT 1
          FROM tenants t
          WHERE t.id = a.tenant_id
            AND t.created_by = recipient.id
        )
      )
      AND ${filter.sql}
    LIMIT 1
  `).get(
    recipientId,
    activityId,
    tenantId,
    ...filter.params
  );
}

async function sendActivityNotifications({
  activityId,
  tenantId,
  recipientIds,
  reassigned = false,
  rescheduled = false,
  changedByLabel = null,
}) {
  for (const recipientId of uniq(recipientIds)) {
    try {
      // Comprobar cada destinatario justo antes de preparar su envío.
      const activity = await getAllowedDelivery(
        activityId,
        tenantId,
        recipientId
      );

      if (!activity) continue;

      const name =
        activity.recipient_name || activity.recipient_email;

            const introduction = rescheduled
        ? "Se ha actualizado la fecha u hora de una actividad que tienes asignada en el CRM."
        : reassigned
          ? "Se te ha reasignado una actividad en el CRM."
          : "Se te ha asignado una nueva actividad en el CRM.";

      const fields = [
        ["Título", activity.title || "Sin título"],
        ["Tipo", activity.type || "task"],
        ["Estado", activity.status || "open"],
        ["Cliente / contacto", activity.contact_label],
      ];

      if (reassigned && changedByLabel) {
        fields.push(["Asignada por", changedByLabel]);
      }

      fields.push(
        ["Fecha de creación", formatDate(activity.created_at)],
        ["Fecha de vencimiento", formatDate(activity.due_date)]
      );

            if (activity.remind_at_ms != null) {
        fields.push([
          "Fecha del recordatorio",
          formatDate(activity.remind_at_ms),
        ]);
      }

      const notes = activity.notes || "—";

      const text = [
        `Hola ${name},`,
        "",
        introduction,
        "",
        ...fields.map(([label, value]) => `${label}: ${value}`),
        "",
        "Notas:",
        notes,
      ].join("\n");

      const html = [
        `<p>Hola ${escapeHtml(name)},</p>`,
        `<p>${escapeHtml(introduction)}</p>`,
        ...fields.map(
          ([label, value]) =>
            `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
        ),
        `<p><strong>Notas:</strong><br/>${
          escapeHtml(notes).replace(/\r?\n/g, "<br/>")
        }</p>`,
      ].join("\n");

           const subjectPrefix = rescheduled
        ? "Actividad reprogramada"
        : reassigned
          ? "Actividad reasignada"
          : "Nueva actividad";

      await sendMail({
        to: String(activity.recipient_email).trim(),
        subject: `${subjectPrefix}: ${String(
          activity.title || "Sin título"
        ).replace(/[\r\n]/g, " ")}`,
        text,
        html,
      });
    } catch (err) {
      // Evita registrar contenido privado o respuestas completas del proveedor.
      console.error("[activityNotifications] Falló un envío", {
        activity_id: activityId,
        code: err.code || "notification_failed",
      });
    }
  }
}

async function notifyActivityCreated(activity) {
  if (!activity?.id || !activity?.tenant_id) return;

  return sendActivityNotifications({
    activityId: activity.id,
    tenantId: activity.tenant_id,
    recipientIds: assigneeIds(activity),
  });
}

async function notifyActivityReassigned(payload) {
  const {
    tenant_id,
    activity,
    before,
    after,
    changed_by,
  } = payload || {};

  if (!activity?.id) return;

  const tenantId = activity.tenant_id || tenant_id;
  if (!tenantId) return;

  if (
    tenant_id &&
    activity.tenant_id &&
    tenant_id !== activity.tenant_id
  ) {
    return;
  }

  const normalizeTimestamp = (value) => {
    if (value == null || value === "") return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const dateChanged =
    normalizeTimestamp(before?.due_date) !==
      normalizeTimestamp(after?.due_date) ||
    normalizeTimestamp(before?.remind_at_ms) !==
      normalizeTimestamp(after?.remind_at_ms);

  const beforeIds = new Set(assigneeIds(before));
  const afterIds = assigneeIds(after);

  const recipientIds = dateChanged
    ? afterIds
    : afterIds.filter((id) => !beforeIds.has(id));

  if (!recipientIds.length) return;

  let changedByLabel = "Sistema";

  if (changed_by) {
    const user = await db.prepare(`
      SELECT name, email
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(changed_by);

    changedByLabel =
      user?.name || user?.email || changedByLabel;
  }

  return sendActivityNotifications({
    activityId: activity.id,
    tenantId,
    recipientIds,
    reassigned: true,
    rescheduled: dateChanged,
    changedByLabel,
  });
}

module.exports = {
  notifyActivityCreated,
  notifyActivityReassigned,
};