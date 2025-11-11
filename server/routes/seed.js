// server/routes/seed.js
/**
 * Endpoint temporal para ejecutar el seed en producción
 * IMPORTANTE: Eliminar después de usarlo por seguridad
 */

const { Router } = require("express");
const router = Router();

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
