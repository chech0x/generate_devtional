/**
 * Servidor HTTP simple para visualizar los devocionales
 * Ejecuta: node serve-devocionales.js
 * Luego abre: http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const OUTPUT_DIR = path.join(__dirname, 'output');

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Decodificar URL
  let filePath = decodeURIComponent(req.url);

  // Si es la raíz, mostrar índice
  if (filePath === '/') {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(file => file.endsWith('.html'))
      .sort()
      .reverse(); // Más recientes primero

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Devocionales</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: #f8f9fa;
    }
    h1 {
      color: #39A8DA;
      text-align: center;
      margin-bottom: 2rem;
    }
    .list {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    a {
      display: block;
      padding: 1rem;
      margin: 0.5rem 0;
      color: #333;
      text-decoration: none;
      border-radius: 8px;
      transition: all 0.2s;
      background: #f8f9fa;
    }
    a:hover {
      background: #39A8DA;
      color: white;
      transform: translateX(8px);
    }
    .count {
      color: #666;
      text-align: center;
      margin-top: 1rem;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <h1>📖 Devocionales Diarios</h1>
  <div class="list">
    ${files.map(file => `<a href="/${file}">${file.replace('.html', '')}</a>`).join('\n')}
  </div>
  <p class="count">Total: ${files.length} devocionales</p>
</body>
</html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Servir archivo
  filePath = path.join(OUTPUT_DIR, filePath);

  // Verificar si existe
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('404 - Archivo no encontrado');
    return;
  }

  // Leer y servir archivo
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error al leer archivo');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ Servidor iniciado en http://localhost:${PORT}`);
  console.log(`📁 Sirviendo archivos desde: ${OUTPUT_DIR}`);
  console.log(`\n💡 Abre http://localhost:${PORT} en tu navegador`);
  console.log(`   El botón "Descargar como imagen" funcionará correctamente\n`);
  console.log(`⏹️  Presiona Ctrl+C para detener el servidor\n`);
});
