// server/lib/mail.js
const axios = require("axios");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL || "no-reply@tudominio.com";
const BREVO_SENDER_NAME =
  process.env.BREVO_SENDER_NAME || "CRM";

async function sendEmail({ to, subject, html, text }) {
  try {
    if (!BREVO_API_KEY) {
      console.log("[mail] BREVO_API_KEY no está definida. Email omitido.");
      return;
    }

    if (!to) {
      console.log("[mail] Campo 'to' vacío. Email omitido.");
      return;
    }

    const toArray = Array.isArray(to) ? to : [to];

    const payload = {
      sender: {
        email: BREVO_SENDER_EMAIL,
        name: BREVO_SENDER_NAME,
      },
      to: toArray.map((email) => ({ email })),
      subject,
      htmlContent: html || (text ? `<p>${text}</p>` : "<p></p>"),
      textContent: text || "",
    };

    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      payload,
      {
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("[mail] Email enviado correctamente:", {
      to: toArray,
      messageId: res.data?.messageId || null,
    });
  } catch (err) {
    const data = err.response?.data;
    console.error(
      "[mail] Error enviando email:",
      data || err.message || err
    );
  }
}

module.exports = {
  sendEmail,
};
