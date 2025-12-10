/**
 * Script combinado - Genera RSS y HTML
 * Ejecuta ambos scripts automáticamente
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('========================================');
console.log('🚀 GENERADOR COMPLETO DE DEVOCIONALES');
console.log('========================================\n');

const scripts = [
  {
    name: 'RSS del Podcast',
    file: 'generate-podcast-rss.js',
    emoji: '🎙️'
  },
  {
    name: 'HTML desde JSON',
    file: 'parse-devotional-json.js',
    emoji: '📄'
  }
];

let successCount = 0;
let errorCount = 0;

scripts.forEach((script, index) => {
  console.log(`\n${script.emoji} [${index + 1}/${scripts.length}] Ejecutando: ${script.name}`);
  console.log('─'.repeat(50));

  try {
    execSync(`node ${script.file}`, {
      stdio: 'inherit',
      cwd: __dirname
    });
    successCount++;
    console.log(`✅ ${script.name} completado\n`);
  } catch (error) {
    errorCount++;
    console.error(`❌ Error en ${script.name}`);
    console.error(error.message + '\n');
  }
});

console.log('\n========================================');
console.log('📊 RESUMEN DE EJECUCIÓN');
console.log('========================================');
console.log(`✅ Exitosos: ${successCount}/${scripts.length}`);
console.log(`❌ Errores:  ${errorCount}/${scripts.length}`);

if (errorCount === 0) {
  console.log('\n🎉 ¡Todo completado exitosamente!');
  console.log('\n📋 ARCHIVOS GENERADOS:');
  console.log('   • podcast.xml (RSS para Spotify)');
  console.log('   • episodes-list.json (Lista de episodios)');
  console.log('   • output/*.html (Archivos HTML individuales)');
  console.log('\n📤 PRÓXIMOS PASOS:');
  console.log('   1. Sube podcast.xml a: https://cenfolic.com/podcast.xml');
  console.log('   2. Sube los archivos MP3 a: https://cenfolic.com/audio/devo/');
  console.log('   3. Envía el RSS a Spotify: https://podcasters.spotify.com/');
  console.log('   4. Opcional: Sube los HTML a tu servidor');
} else {
  console.log('\n⚠️  Revisa los errores arriba y vuelve a intentarlo');
  process.exit(1);
}
