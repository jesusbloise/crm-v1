// server/lib/activityNotifications.js
const db = require("../db/connection");
const { sendMail } = require("./mailer");

function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/**
 * Recibe el objeto activity completo (el mismo que devolvemos en el POST),
 * busca los usuarios asignados en la tabla `users`, toma sus emails
 * y les envía el correo.
 */
async function notifyActivityCreated(activity) {
  if (!activity) {
    console.log("notifyActivityCreated: actividad vacía");
    return;
  }

  const userIds = [];
  if (activity.assigned_to) userIds.push(activity.assigned_to);
  if (
    activity.assigned_to_2 &&
    activity.assigned_to_2 !== activity.assigned_to
  ) {
    userIds.push(activity.assigned_to_2);
  }

  if (!userIds.length) {
    console.log(
      "notifyActivityCreated: actividad sin usuarios asignados, no se envía correo",
      {
        assigned_to: activity.assigned_to,
        assigned_to_2: activity.assigned_to_2,
      }
    );
    return;
  }

  // 🔍 Buscamos esos usuarios en la tabla `users`
  const placeholders = userIds.map(() => "?").join(",");
  const res = await db
    .prepare(
      `
      SELECT id, name, email
      FROM users
      WHERE id IN (${placeholders})
    `
    )
    .all(...userIds);

  const users = Array.isArray(res) ? res : res?.rows || [];

  const recipients = users
    .filter(
      (u) =>
        u.email &&
        String(u.email).trim().length > 0 // solo los que tienen email
    )
    .map((u) => ({
      id: u.id,
      email: String(u.email).trim(),
      name: u.name || String(u.email).trim(),
    }));

  if (!recipients.length) {
    console.log(
      "notifyActivityCreated: usuarios asignados sin email, no se envía correo",
      {
        assigned_to: activity.assigned_to,
        assigned_to_2: activity.assigned_to_2,
        users,
      }
    );
    return;
  }

  // 🔍 Info del cliente/contacto (opcional, para el cuerpo del correo)
  let contactLabel = "Cliente sin nombre";
  if (activity.contact_id) {
    const contact = await db
      .prepare(
        `
        SELECT name, email
        FROM contacts
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `
      )
      .get(activity.contact_id, activity.tenant_id);

    if (contact) {
      contactLabel =
        contact.name ||
        contact.email ||
        `Contacto ${String(activity.contact_id).substring(0, 8)}`;
    }
  }

  const createdAt = formatDate(activity.created_at);
  const dueDate = formatDate(activity.due_date);

  const baseText = `
Se te ha asignado una nueva actividad en el CRM.

Título: ${activity.title || "Sin título"}
Tipo: ${activity.type || "task"}
Estado: ${activity.status || "open"}
Cliente / contacto: ${contactLabel}
Fecha de creación: ${createdAt}
Fecha de vencimiento: ${dueDate}

Notas:
${activity.notes || "—"}
`;

  const baseHtml = `
<p>Se te ha asignado una nueva actividad en el CRM.</p>

<p><strong>Título:</strong> ${activity.title || "Sin título"}</p>
<p><strong>Tipo:</strong> ${activity.type || "task"}</p>
<p><strong>Estado:</strong> ${activity.status || "open"}</p>
<p><strong>Cliente / contacto:</strong> ${contactLabel}</p>
<p><strong>Fecha de creación:</strong> ${createdAt}</p>
<p><strong>Fecha de vencimiento:</strong> ${dueDate}</p>

<p><strong>Notas:</strong><br/>${
    activity.notes ? activity.notes.replace(/\n/g, "<br/>") : "—"
  }</p>
`;

  const subject = `Nueva actividad: ${activity.title || "Sin título"}`;

  // 📩 Un correo por destinatario
  for (const r of recipients) {
    try {
      await sendMail({
        to: r.email,
        subject,
        text: `Hola ${r.name},\n\n${baseText}`,
        html: `<p>Hola ${r.name},</p>${baseHtml}`,
      });
      console.log("✉️  Correo de actividad enviado a:", r.email);
    } catch (err) {
      console.error("❌ Error enviando correo a", r.email, err);
    }
  }
}

module.exports = {
  notifyActivityCreated,
};
