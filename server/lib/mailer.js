const nodemailer = require("nodemailer");

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
} = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !MAIL_FROM) {
  console.warn("⚠️ Falta configuración SMTP en .env, no se enviarán correos");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT) || 587,
  secure: false,            // Gmail + 587 = STARTTLS
  requireTLS: true,
  auth: {
    user: SMTP_USER.trim(),
    pass: SMTP_PASS.trim(),
  },
});

async function sendMail({ to, subject, html, text }) {
  console.log("📨 Intentando enviar correo a:", to, "asunto:", subject);

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn("⚠️ SMTP no configurado, simulando envío:", { to, subject });
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      text,
      html,
    });

    console.log("📧 Email enviado OK:", info.messageId);
  } catch (err) {
    console.error("❌ Error enviando correo:", err);
  }
}

module.exports = { sendMail };
