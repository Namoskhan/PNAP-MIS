const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../../pnap-mis/web/src');
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../pnap-mis/web/package.json')));

console.log('Dependencies in package.json:');
console.log(packageJson.dependencies);

function getImports(dir) {
  const externalImports = {};
  const localImports = {};
  const fileSizes = [];

  function walk(d) {
    const files = fs.readdirSync(d, { withFileTypes: true });
    for (const f of files) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) {
        walk(full);
      } else if (f.name.endsWith('.js') || f.name.endsWith('.jsx')) {
        const content = fs.readFileSync(full, 'utf8');
        const stats = fs.statSync(full);
        fileSizes.push({
          file: path.relative(srcDir, full).replace(/\\/g, '/'),
          bytes: stats.size,
          lines: content.split('\n').length
        });

        const regex = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\))/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
          const mod = match[1] || match[2];
          if (!mod.startsWith('.')) {
            externalImports[mod] = (externalImports[mod] || 0) + 1;
          } else {
            localImports[mod] = (localImports[mod] || 0) + 1;
          }
        }
      }
    }
  }

  walk(dir);
  return { externalImports, fileSizes };
}

const { externalImports, fileSizes } = getImports(srcDir);
console.log('\nExternal packages imported in src:');
console.log(externalImports);

fileSizes.sort((a, b) => b.bytes - a.bytes);
console.log('\nTop 20 largest source files in web/src:');
console.log(fileSizes.slice(0, 20));

// Calculate totals by directory
const byDir = {};
for (const f of fileSizes) {
  const dir = f.file.split('/')[0];
  byDir[dir] = (byDir[dir] || 0) + f.bytes;
}
console.log('\nSource bytes by directory:');
console.log(byDir);
