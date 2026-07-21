const db = require("../db/connection");
const { sendMail } = require("./mailer");
const { getCalendarClientFromRefresh } = require("./google");

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanTime(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function formatDate(value) {
  if (!value) return "-";
  const parts = String(value).split("-");
  if (parts.length !== 3) return String(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatHours(value) {
  const totalMinutes = Math.round(toNumber(value) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function addHoursToTime(time, hours) {
  const safeTime = cleanTime(time) || "09:00";
  const [hh, mm] = safeTime.split(":").map(Number);

  const d = new Date(Date.UTC(2000, 0, 1, hh, mm, 0));
  d.setMinutes(d.getMinutes() + Math.round(toNumber(hours) * 60));

  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}`;
}

function calendarDateTime(date, time) {
  return `${date}T${time}:00`;
}

async function getUserForNotification(userId) {
  if (!userId) return null;

  return db
    .prepare(
      `
      SELECT
        id,
        name,
        email,
        google_email,
        google_refresh_token,
        google_calendar_id
      FROM users
      WHERE id = ?
      LIMIT 1
    `
    )
    .get(String(userId));
}

async function markEmailSent(assignment) {
  const now = Date.now();

  await db
    .prepare(
      `
      UPDATE work_assignments
      SET email_sent_at = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
    )
    .run(now, now, assignment.id, assignment.tenant_id);
}

async function markGoogleEventCreated(assignment, eventId) {
  if (!eventId) return;

  const now = Date.now();

  await db
    .prepare(
      `
      UPDATE work_assignments
      SET google_event_id = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `
    )
    .run(eventId, now, assignment.id, assignment.tenant_id);
}

async function sendAssignmentEmail({ assignment, assignedUser, createdByUser }) {
  if (!assignedUser?.email) {
    console.log("Asignacion de horas sin email de usuario asignado:", {
      assignment_id: assignment.id,
      assigned_user_id: assignment.assigned_user_id,
    });
    return;
  }

  const assignedName = assignedUser.name || assignedUser.email || "Usuario";
  const createdByName =
    createdByUser?.name || createdByUser?.email || "Un administrador";

  const start = cleanTime(assignment.start_time);
  const end = cleanTime(assignment.end_time);
  const timeLabel =
    start && end ? `${start} - ${end}` : start ? start : "Sin hora definida";

  const subject = `Nueva asignacion de horas: ${assignment.project_name}`;

  const text = `
Hola ${assignedName},

Se te ha asignado una nueva jornada de trabajo en el CRM.

Proyecto: ${assignment.project_name}
Item: ${assignment.item_name}
Fecha: ${formatDate(assignment.assignment_date)}
Horario: ${timeLabel}
Horas estimadas: ${formatHours(assignment.estimated_hours)}
Asignado por: ${createdByName}

Descripcion:
${assignment.description || "-"}

Puedes verla en el modulo Mis horas.
`;

  const html = `
<p>Hola ${assignedName},</p>

<p>Se te ha asignado una nueva jornada de trabajo en el CRM.</p>

<p><strong>Proyecto:</strong> ${assignment.project_name}</p>
<p><strong>Item:</strong> ${assignment.item_name}</p>
<p><strong>Fecha:</strong> ${formatDate(assignment.assignment_date)}</p>
<p><strong>Horario:</strong> ${timeLabel}</p>
<p><strong>Horas estimadas:</strong> ${formatHours(
    assignment.estimated_hours
  )}</p>
<p><strong>Asignado por:</strong> ${createdByName}</p>

<p><strong>Descripcion:</strong><br/>${
    assignment.description
      ? String(assignment.description).replace(/\n/g, "<br/>")
      : "-"
  }</p>

<p>Puedes verla en el modulo <strong>Mis horas</strong>.</p>
`;

  await sendMail({
    to: assignedUser.email,
    subject,
    text,
    html,
  });

  await markEmailSent(assignment);
}

async function createAssignmentCalendarEvent({
  assignment,
  assignedUser,
  createdByUser,
}) {
  if (!assignedUser?.google_refresh_token) {
    console.log("Calendario omitido: usuario sin Google conectado", {
      assignment_id: assignment.id,
      assigned_user_id: assignment.assigned_user_id,
    });
    return;
  }

  if (!assignment.assignment_date) {
    console.log("Calendario omitido: asignacion sin fecha", {
      assignment_id: assignment.id,
    });
    return;
  }

  const startTime = cleanTime(assignment.start_time) || "09:00";
  const endTime =
    cleanTime(assignment.end_time) ||
    addHoursToTime(startTime, assignment.estimated_hours || 1);

  const calendarId = assignedUser.google_calendar_id || "primary";

  const createdByName =
    createdByUser?.name || createdByUser?.email || "Un administrador";

  const description = [
    "Asignacion de horas creada desde CRM Atomica.",
    "",
    `Proyecto: ${assignment.project_name}`,
    `Item: ${assignment.item_name}`,
    `Horas estimadas: ${formatHours(assignment.estimated_hours)}`,
    `Asignado por: ${createdByName}`,
    "",
    "Descripcion:",
    assignment.description || "-",
  ].join("\n");

  const cal = await getCalendarClientFromRefresh(
    assignedUser.google_refresh_token
  );

  const { data } = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: `Trabajo asignado: ${assignment.project_name}`,
      description,
      start: {
        dateTime: calendarDateTime(assignment.assignment_date, startTime),
        timeZone: "America/Santiago",
      },
      end: {
        dateTime: calendarDateTime(assignment.assignment_date, endTime),
        timeZone: "America/Santiago",
      },
    },
  });

  await markGoogleEventCreated(assignment, data?.id || null);

  console.log("Evento de calendario creado para asignacion:", {
    assignment_id: assignment.id,
    event_id: data?.id || null,
    user_id: assignedUser.id,
    calendar_id: calendarId,
  });
}

async function notifyWorkAssignmentCreated(assignment) {
  if (!assignment) return;

  const assignedUser = await getUserForNotification(
    assignment.assigned_user_id
  );
  const createdByUser = await getUserForNotification(assignment.created_by);

  if (!assignedUser) {
    console.log("Asignacion sin usuario asignado encontrado:", {
      assignment_id: assignment.id,
      assigned_user_id: assignment.assigned_user_id,
    });
    return;
  }

  try {
    await sendAssignmentEmail({
      assignment,
      assignedUser,
      createdByUser,
    });
  } catch (err) {
    console.error("Error enviando correo de asignacion de horas:", {
      assignment_id: assignment.id,
      error: err?.response?.data || err?.message || err,
    });
  }

  try {
    await createAssignmentCalendarEvent({
      assignment,
      assignedUser,
      createdByUser,
    });
  } catch (err) {
    console.error("Error creando evento de calendario para asignacion:", {
      assignment_id: assignment.id,
      error: err?.response?.data || err?.message || err,
    });
  }
}

module.exports = {
  notifyWorkAssignmentCreated,
};
