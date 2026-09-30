const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require(path.join(__dirname, '../../../pnap-mis/node_modules/mongoose'));

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/admin');
  const buildInfo = await mongoose.connection.db.admin().buildInfo();
  await mongoose.disconnect();

  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  const nodeVersion = process.version;
  const cpus = os.cpus();
  const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(2);
  const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(2);

  let diskInfo = '';
  try {
    diskInfo = execSync('powershell -NoProfile -Command "Get-PSDrive D,C | Select-Object Name, @{Name=\'FreeGB\';Expression={[math]::round($_.Free/1GB,2)}}, @{Name=\'UsedGB\';Expression={[math]::round($_.Used/1GB,2)}} | ConvertTo-Json"', { encoding: 'utf8' });
  } catch (e) {
    diskInfo = e.message;
  }

  const env = {
    timestamp: new Date().toISOString(),
    os: `${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`,
    cpuModel: cpus[0].model,
    cpuSpeedMhz: cpus[0].speed,
    logicalProcessors: cpus.length,
    totalRamGB: parseFloat(totalMemGB),
    freeRamGB: parseFloat(freeMemGB),
    nodeVersion,
    npmVersion,
    mongoDbVersion: buildInfo.version,
    mongoDbGitVersion: buildInfo.gitVersion,
    mongoDbHost: '127.0.0.1:27017',
    mongoDbPath: 'C:\\Program Files\\MongoDB\\Server\\8.0\\data\\',
    frontendFramework: 'React 18.3.1',
    bundler: 'Vite 5.4.21',
    backendPort: 5000,
    frontendPreviewPort: 5005,
    testServerPort: 5006,
    diskDrives: JSON.parse(diskInfo)
  };

  fs.writeFileSync(path.join(__dirname, 'environment.json'), JSON.stringify(env, null, 2));
  console.log('Environment written to environment.json');
  console.log(JSON.stringify(env, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
