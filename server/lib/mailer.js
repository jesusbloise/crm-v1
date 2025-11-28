// server/lib/mailer.js
const axios = require("axios");

const API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const SENDER_NAME = process.env.BREVO_SENDER_NAME || "CRM Atomica";

if (!API_KEY) {
  console.warn("⚠️ BREVO_API_KEY no está definida. No se podrán enviar correos.");
}
if (!SENDER_EMAIL) {
  console.warn("⚠️ BREVO_SENDER_EMAIL no está definida. Brevo puede rechazar el envío.");
}

async function sendMail({ to, subject, text, html }) {
  if (!API_KEY) {
    throw new Error("BREVO_API_KEY missing");
  }
  if (!to) {
    throw new Error("sendMail: 'to' es obligatorio");
  }

  const payload = {
    sender: {
      email: SENDER_EMAIL,
      name: SENDER_NAME,
    },
    to: [
      {
        email: to,
      },
    ],
    subject,
    textContent: text || "",
    htmlContent: html || "",
  };

  try {
    console.log("📤 Enviando correo vía Brevo a:", to);
    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      payload,
      {
        headers: {
          "api-key": API_KEY,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("✅ Brevo respuesta OK:", res.status, res.data?.messageId || "");
    return res.data;
  } catch (err) {
    // Log detallado para debug
    console.error("❌ Error al enviar correo con Brevo:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
    } else {
      console.error("Mensaje:", err.message);
    }
    throw err;
  }
}

module.exports = {
  sendMail,
};
