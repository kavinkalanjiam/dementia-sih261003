import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const tunnelConfigFile = path.join(publicDir, 'tunnel-url.json');

console.log('🚀 Starting SIROI Vite Dev Server...');
const viteProcess = spawn('npx.cmd', ['vite', '--host', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true,
});

console.log('🌐 Starting Cloudflare 5G/4G Mobile Data Tunnel...');
const cfExePath = path.resolve('cloudflared.exe');

function startTunnel() {
  const cfProcess = spawn(cfExePath, ['tunnel', '--url', 'http://127.0.0.1:5173']);

  const handleTunnelData = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      const tunnelUrl = match[0];
      console.log('\n======================================================');
      console.log('🟢 CLOUDFLARE 5G/4G MOBILE DATA TUNNEL ONLINE:');
      console.log('👉 ' + tunnelUrl);
      console.log('======================================================\n');

      const config = {
        url: tunnelUrl,
        active: true,
        updatedAt: Date.now(),
      };
      try {
        fs.writeFileSync(tunnelConfigFile, JSON.stringify(config, null, 2));
      } catch (err) {
        console.warn('Error writing tunnel-url.json', err);
      }
    }
  };

  cfProcess.stdout.on('data', handleTunnelData);
  cfProcess.stderr.on('data', handleTunnelData);

  cfProcess.on('exit', (code) => {
    console.warn(`Cloudflare tunnel exited with code ${code}, restarting in 5s...`);
    setTimeout(startTunnel, 5000);
  });
}

console.log('🧠 Starting SIROI Python ML Cognitive Analysis Service...');
const mlDir = path.resolve('ml-service');
const mlProcess = spawn('py', ['-3.13', '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
  cwd: mlDir,
  stdio: 'inherit',
  shell: true,
});

setTimeout(startTunnel, 2000);

process.on('SIGINT', () => {
  try { viteProcess.kill(); } catch {}
  try { mlProcess.kill(); } catch {}
  process.exit();
});
