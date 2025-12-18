// server/lib/activityNotifications.js
const db = require("../db/connection");
const { sendMail } = require("./mailer");

function formatDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CL");
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function arrEqAsSet(a, b) {
  const sa = new Set((a || []).filter(Boolean));
  const sb = new Set((b || []).filter(Boolean));
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}
function unwrapRow(x) {
  if (!x) return null;
  if (Array.isArray(x?.rows)) return x.rows[0] ?? null;
  if (x?.row) return x.row;
  return x;
}

async function getUsersByIds(userIds) {
  const ids = uniq(userIds);
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `
      SELECT id, name, email
      FROM users
      WHERE id IN (${placeholders})
    `
    )
    .all(...ids);

  const users = Array.isArray(rows) ? rows : rows?.rows || [];
  return users.map((u) => ({
    id: u.id,
    name: u.name || null,
    email: u.email ? String(u.email).trim() : null,
  }));
}

async function getContactLabel(activity) {
  let contactLabel = "Cliente sin nombre";
  if (activity?.contact_id) {
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
  return contactLabel;
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
  if (activity.assigned_to_2 && activity.assigned_to_2 !== activity.assigned_to) {
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

  const users = await getUsersByIds(userIds);

  const recipients = users
    .filter((u) => u.email && u.email.length > 0)
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name || u.email,
    }));

  if (!recipients.length) {
    console.log("notifyActivityCreated: usuarios asignados sin email, no se envía correo", {
      assigned_to: activity.assigned_to,
      assigned_to_2: activity.assigned_to_2,
      users,
    });
    return;
  }

  const contactLabel = await getContactLabel(activity);

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
    activity.notes ? String(activity.notes).replace(/\n/g, "<br/>") : "—"
  }</p>
`;

  const subject = `Nueva actividad: ${activity.title || "Sin título"}`;

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

/**
 * ✅ Notifica reasignación (PATCH) SOLO cuando el front lo confirma (notify_assignees=true).
 *
 * Anti-spam:
 * - Solo avisa a los NUEVOS asignados (los que antes no estaban y ahora sí).
 * - Si solo se desasigna, no manda correo.
 * - (Opcional recomendado) No se lo manda al usuario que hizo el cambio.
 */
async function notifyActivityReassigned(payload) {
  const { tenant_id, activity, before, after, changed_by } = payload || {};

  if (!activity) {
    console.log("notifyActivityReassigned: actividad vacía");
    return;
  }

  // Asegurar tenant_id consistente para queries de contacto
  const activityTenantId = activity.tenant_id ?? tenant_id ?? null;

  const beforeIds = uniq([
    before?.assigned_to ?? null,
    before?.assigned_to_2 ?? null,
  ]);
  const afterIds = uniq([
    after?.assigned_to ?? null,
    after?.assigned_to_2 ?? null,
  ]);

  if (arrEqAsSet(beforeIds, afterIds)) {
    console.log("notifyActivityReassigned: sin cambios reales de asignación", {
      activity_id: activity.id,
    });
    return;
  }

  // ✅ SOLO nuevos asignados
  let newAssignees = afterIds.filter((id) => !beforeIds.includes(id));

  // ✅ (recomendado) evitar mandar a quien hizo el cambio
  // if (changed_by) {
  //   newAssignees = newAssignees.filter((id) => id !== changed_by);
  // }

  // if (!newAssignees.length) {
  //   console.log("notifyActivityReassigned: no hay nuevos asignados a notificar", {
  //     activity_id: activity.id,
  //     reason: changed_by ? "solo desasignación o auto-asignación" : "solo desasignación",
  //   });
  //   return;
  // }

  const users = await getUsersByIds(newAssignees);
  const recipients = users
    .filter((u) => u.email && u.email.length > 0)
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name || u.email,
    }));

  if (!recipients.length) {
    console.log("notifyActivityReassigned: nuevos asignados sin email, no se envía correo", {
      activity_id: activity.id,
      newAssignees,
      users,
    });
    return;
  }

  // Quién hizo el cambio (opcional)
  let changedByLabel = "Sistema";
  if (changed_by) {
    const u = await db
      .prepare(`SELECT name, email FROM users WHERE id = ? LIMIT 1`)
      .get(changed_by);
    if (u) changedByLabel = u.name || u.email || changedByLabel;
  }

  // Contacto opcional
  const activityForContact = {
    ...activity,
    tenant_id: activityTenantId,
  };
  const contactLabel = await getContactLabel(activityForContact);

  const createdAt = formatDate(activity.created_at);
  const dueDate = formatDate(activity.due_date);

  const subject = `Actividad reasignada: ${activity.title || "Sin título"}`;

  const baseText = `
Se te ha reasignado una actividad en el CRM.

Título: ${activity.title || "Sin título"}
Tipo: ${activity.type || "task"}
Estado: ${activity.status || "open"}
Cliente / contacto: ${contactLabel}
Asignada por: ${changedByLabel}
Fecha de creación: ${createdAt}
Fecha de vencimiento: ${dueDate}

Notas:
${activity.notes || "—"}
`;

  const baseHtml = `
<p>Se te ha reasignado una actividad en el CRM.</p>

<p><strong>Título:</strong> ${activity.title || "Sin título"}</p>
<p><strong>Tipo:</strong> ${activity.type || "task"}</p>
<p><strong>Estado:</strong> ${activity.status || "open"}</p>
<p><strong>Cliente / contacto:</strong> ${contactLabel}</p>
<p><strong>Asignada por:</strong> ${changedByLabel}</p>
<p><strong>Fecha de creación:</strong> ${createdAt}</p>
<p><strong>Fecha de vencimiento:</strong> ${dueDate}</p>

<p><strong>Notas:</strong><br/>${
    activity.notes ? String(activity.notes).replace(/\n/g, "<br/>") : "—"
  }</p>
`;

  for (const r of recipients) {
    try {
      await sendMail({
        to: r.email,
        subject,
        text: `Hola ${r.name},\n\n${baseText}`,
        html: `<p>Hola ${r.name},</p>${baseHtml}`,
      });
      console.log("✉️  Correo de reasignación enviado a:", r.email, {
        activity_id: activity.id,
      });
    } catch (err) {
      console.error("❌ Error enviando correo (reasignación) a", r.email, err);
    }
  }
}

module.exports = {
  notifyActivityCreated,
  notifyActivityReassigned,
};


// // server/lib/activityNotifications.js
// const db = require("../db/connection");
// const { sendMail } = require("./mailer");

// function formatDate(ms) {
//   if (!ms) return "—";
//   const d = new Date(ms);
//   if (Number.isNaN(d.getTime())) return "—";
//   return d.toLocaleString();
// }

// /**
//  * Recibe el objeto activity completo (el mismo que devolvemos en el POST),
//  * busca los usuarios asignados en la tabla `users`, toma sus emails
//  * y les envía el correo.
//  */
// async function notifyActivityCreated(activity) {
//   if (!activity) {
//     console.log("notifyActivityCreated: actividad vacía");
//     return;
//   }

//   const userIds = [];
//   if (activity.assigned_to) userIds.push(activity.assigned_to);
//   if (
//     activity.assigned_to_2 &&
//     activity.assigned_to_2 !== activity.assigned_to
//   ) {
//     userIds.push(activity.assigned_to_2);
//   }

//   if (!userIds.length) {
//     console.log(
//       "notifyActivityCreated: actividad sin usuarios asignados, no se envía correo",
//       {
//         assigned_to: activity.assigned_to,
//         assigned_to_2: activity.assigned_to_2,
//       }
//     );
//     return;
//   }

//   // 🔍 Buscamos esos usuarios en la tabla `users`
//   const placeholders = userIds.map(() => "?").join(",");
//   const res = await db
//     .prepare(
//       `
//       SELECT id, name, email
//       FROM users
//       WHERE id IN (${placeholders})
//     `
//     )
//     .all(...userIds);

//   const users = Array.isArray(res) ? res : res?.rows || [];

//   const recipients = users
//     .filter(
//       (u) =>
//         u.email &&
//         String(u.email).trim().length > 0 // solo los que tienen email
//     )
//     .map((u) => ({
//       id: u.id,
//       email: String(u.email).trim(),
//       name: u.name || String(u.email).trim(),
//     }));

//   if (!recipients.length) {
//     console.log(
//       "notifyActivityCreated: usuarios asignados sin email, no se envía correo",
//       {
//         assigned_to: activity.assigned_to,
//         assigned_to_2: activity.assigned_to_2,
//         users,
//       }
//     );
//     return;
//   }

//   // 🔍 Info del cliente/contacto (opcional, para el cuerpo del correo)
//   let contactLabel = "Cliente sin nombre";
//   if (activity.contact_id) {
//     const contact = await db
//       .prepare(
//         `
//         SELECT name, email
//         FROM contacts
//         WHERE id = ? AND tenant_id = ?
//         LIMIT 1
//       `
//       )
//       .get(activity.contact_id, activity.tenant_id);

//     if (contact) {
//       contactLabel =
//         contact.name ||
//         contact.email ||
//         `Contacto ${String(activity.contact_id).substring(0, 8)}`;
//     }
//   }

//   const createdAt = formatDate(activity.created_at);
//   const dueDate = formatDate(activity.due_date);

//   const baseText = `
// Se te ha asignado una nueva actividad en el CRM.

// Título: ${activity.title || "Sin título"}
// Tipo: ${activity.type || "task"}
// Estado: ${activity.status || "open"}
// Cliente / contacto: ${contactLabel}
// Fecha de creación: ${createdAt}
// Fecha de vencimiento: ${dueDate}

// Notas:
// ${activity.notes || "—"}
// `;

//   const baseHtml = `
// <p>Se te ha asignado una nueva actividad en el CRM.</p>

// <p><strong>Título:</strong> ${activity.title || "Sin título"}</p>
// <p><strong>Tipo:</strong> ${activity.type || "task"}</p>
// <p><strong>Estado:</strong> ${activity.status || "open"}</p>
// <p><strong>Cliente / contacto:</strong> ${contactLabel}</p>
// <p><strong>Fecha de creación:</strong> ${createdAt}</p>
// <p><strong>Fecha de vencimiento:</strong> ${dueDate}</p>

// <p><strong>Notas:</strong><br/>${
//     activity.notes ? activity.notes.replace(/\n/g, "<br/>") : "—"
//   }</p>
// `;

//   const subject = `Nueva actividad: ${activity.title || "Sin título"}`;

//   // 📩 Un correo por destinatario
//   for (const r of recipients) {
//     try {
//       await sendMail({
//         to: r.email,
//         subject,
//         text: `Hola ${r.name},\n\n${baseText}`,
//         html: `<p>Hola ${r.name},</p>${baseHtml}`,
//       });
//       console.log("✉️  Correo de actividad enviado a:", r.email);
//     } catch (err) {
//       console.error("❌ Error enviando correo a", r.email, err);
//     }
//   }
// }

// module.exports = {
//   notifyActivityCreated,
// };
