// Script para aplicar rol global a usuarios existentes
require('dotenv').config();
const db = require('../db/connection');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('\n🔧 APLICANDO ROL GLOBAL A USUARIOS\n');
  console.log('=' .repeat(80));
  
  try {
    // 1. Verificar si columna role ya existe
    console.log('\n📋 Verificando estado actual...');
    
    const checkColumn = await db.prepare(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'role'
    `).get();
    
    if (checkColumn) {
      console.log('   ℹ️  Columna "role" ya existe');
    } else {
      console.log('   ⚠️  Columna "role" NO existe - Creando...');
      
      // Crear columna role
      await db.prepare(`
        ALTER TABLE users 
        ADD COLUMN role VARCHAR(20) DEFAULT 'member' 
        CHECK (role IN ('member', 'admin', 'owner'))
      `).run();
      
      console.log('   ✅ Columna "role" creada');
    }
    
    // 2. Actualizar usuarios existentes
    console.log('\n📝 Actualizando usuarios existentes...');
    
    // Actualizar usuarios no-jesusbloise a 'member'
    const updateMembers = await db.prepare(`
      UPDATE users 
      SET role = 'member' 
      WHERE (role IS NULL OR role = '') 
        AND email != 'jesusbloise@gmail.com'
    `).run();
    
    console.log(`   → ${updateMembers.changes || 0} usuarios actualizados a 'member'`);
    
    // Actualizar jesusbloise a 'owner'
    const updateOwner = await db.prepare(`
      UPDATE users 
      SET role = 'owner' 
      WHERE email = 'jesusbloise@gmail.com'
    `).run();
    
    console.log(`   → ${updateOwner.changes || 0} usuario actualizado a 'owner'`);
    
    // 3. Crear índice
    const checkIndex = await db.prepare(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'users' AND indexname = 'idx_users_role'
    `).get();
    
    if (!checkIndex) {
      await db.prepare('CREATE INDEX idx_users_role ON users(role)').run();
      console.log('   ✅ Índice creado');
    } else {
      console.log('   ℹ️  Índice ya existe');
    }
    
    console.log('   ✅ Migración completada');
    
    // 2. Verificar estado de usuarios
    console.log('\n📊 ESTADO DE USUARIOS:');
    const users = await db.prepare(
      `SELECT id, email, name, role 
       FROM users 
       ORDER BY 
         CASE 
           WHEN role = 'owner' THEN 1 
           WHEN role = 'admin' THEN 2 
           ELSE 3 
         END, 
         email`
    ).all();
    
    const roleCounts = {
      owner: 0,
      admin: 0,
      member: 0
    };
    
    users.forEach(u => {
      const roleEmoji = u.role === 'owner' ? '👑' : u.role === 'admin' ? '🔑' : '👤';
      console.log(`  ${roleEmoji} ${u.email} (${u.name}) → ${u.role.toUpperCase()}`);
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
    });
    
    console.log('\n📈 RESUMEN:');
    console.log(`  👑 Owners: ${roleCounts.owner}`);
    console.log(`  🔑 Admins: ${roleCounts.admin}`);
    console.log(`  👤 Members: ${roleCounts.member}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Rol global aplicado correctamente\n');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
