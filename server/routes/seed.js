// server/routes/seed.js
/**
 * Endpoint temporal para ejecutar el seed en producción
 * IMPORTANTE: Eliminar después de usarlo por seguridad
 */

const { Router } = require("express");
const router = Router();

router.get("/seed/reset-password", async (req, res) => {
  try {
    console.log("\n🔑 Reseteando contraseña...\n");
    
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execPromise = promisify(exec);
    
    const { stdout, stderr } = await execPromise("node scripts/resetPassword.js", {
      cwd: __dirname + "/..",
    });
    
    res.json({
      success: true,
      message: "✅ Contraseña reseteada",
      output: stdout,
      errors: stderr || null,
    });
  } catch (error) {
    console.error("❌ Error reseteando contraseña:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      output: error.stdout || null,
      errors: error.stderr || null,
    });
  }
});

router.get("/seed/fix-timestamps", async (req, res) => {
  try {
    console.log("\n🔧 Ejecutando fix de timestamps...\n");
    
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execPromise = promisify(exec);
    
    const { stdout, stderr } = await execPromise("node scripts/fixTimestampsPostgres.js", {
      cwd: __dirname + "/..",
    });
    
    res.json({
      success: true,
      message: "✅ Timestamps convertidos a BIGINT",
      output: stdout,
      errors: stderr || null,
    });
  } catch (error) {
    console.error("❌ Error ejecutando fix:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      output: error.stdout || null,
      errors: error.stderr || null,
    });
  }
});

router.get("/seed/production", async (req, res) => {
  try {
    console.log("\n🌱 Ejecutando seed de producción desde endpoint...\n");
    
    // Importar y ejecutar el script de seed correcto
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execPromise = promisify(exec);
    
    const { stdout, stderr } = await execPromise("node scripts/seedProduction.js", {
      cwd: __dirname + "/..",
    });
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    res.json({
      success: true,
      message: "✅ Seed ejecutado exitosamente!",
      output: stdout,
      credentials: {
        jesusbloise: "jesusbloise@gmail.com / jesus123",
        luisa: "luisa@gmail.com / luisa123",
        carolina: "carolina@gmail.com / carolina123",
      },
    });

  } catch (error) {
    console.error("❌ Error en seed:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

module.exports = router;
