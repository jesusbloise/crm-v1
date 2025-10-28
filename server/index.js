// server/index.js
require("dotenv").config();

const app = require("./app");

const PORT = Number(process.env.PORT) || 3001; // ← default 3001 para calzar con el cliente
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  const shownHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  const env = process.env.NODE_ENV || "development";
  console.log(`🚀 API running on http://${shownHost}:${PORT} (env: ${env})`);
});

// Manejo de errores del servidor (puerto en uso, etc.)
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`❌ Puerto ${PORT} en uso. Cierra procesos Node o cambia PORT en .env`);
    if (process.platform === "win32") {
      console.error("💡 Sugerencia (PowerShell): taskkill /F /IM node.exe");
    }
  } else {
    console.error("❌ Server error:", err);
  }
});

// Captura errores no manejados para evitar que el proceso muera silenciosamente
process.on("unhandledRejection", (reason) => {
  console.error("⚠️  Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("⚠️  Uncaught Exception:", err);
});

// Apagado limpio (Ctrl+C, contenedores, etc.)
const shutdown = () => {
  console.log("⏳ Cerrando servidor...");
  server.close(() => {
    console.log("✅ Servidor cerrado.");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


// // server/index.js
// require("dotenv").config();

// const app = require("./app");

// const PORT = Number(process.env.PORT) || 4000;
// const HOST = process.env.HOST || "0.0.0.0";

// const server = app.listen(PORT, HOST, () => {
//   const shownHost = HOST === "0.0.0.0" ? "localhost" : HOST;
//   console.log(`API running on http://${shownHost}:${PORT}`);
// });

// // Manejo de errores del servidor (puerto en uso, etc.)
// server.on("error", (err) => {
//   if (err.code === "EADDRINUSE") {
//     console.error(`❌ Puerto ${PORT} en uso. Cierra procesos Node o cambia PORT en .env`);
//     if (process.platform === "win32") {
//       console.error('Sugerencia (PowerShell): taskkill /F /IM node.exe');
//     }
//   } else {
//     console.error("❌ Server error:", err);
//   }
// });

// // Apagado limpio (Ctrl+C, contenedores, etc.)
// const shutdown = () => {
//   console.log("⏳ Cerrando servidor...");
//   server.close(() => {
//     console.log("✅ Servidor cerrado.");
//     process.exit(0);
//   });
// };

// process.on("SIGINT", shutdown);
// process.on("SIGTERM", shutdown);


// const app = require("./app");

// const PORT = process.env.PORT || 4000;
// app.listen(PORT, () => {
//   console.log(`API running on http://localhost:${PORT}`);
// });


