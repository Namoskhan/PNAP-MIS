const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'cabinet_data.json'), 'utf8'));

let md = `# PNAP-MIS Cabinet Roles & Login Directory

This document contains the login credentials for all **Cabinet Role Holders** across every level of the organization: **Central, Provincial, District, and Area**.

---

## 🔑 Universal Cabinet Password
All Cabinet accounts have been standardized with the following password:
\`\`\`text
123456
\`\`\`
*(Legacy fallback password: \`Member@123\`)*

You can log in to the MIS Web Portal (\`http://localhost:5173\`) or Mobile App using either the **Email Address**, **Username**, or **CNIC**.

---

## 🏛️ Central Cabinet (PKNAP Central)

| Role Title | Officer Name | Login Email | Username | CNIC | Password |
| :--- | :--- | :--- | :--- | :--- | :--- |
`;

for (const r of data.CENTRAL) {
  md += `| **${r.roleLabel}** | ${r.memberName} | \`${r.email}\` | \`${r.username}\` | \`${r.cnic}\` | \`123456\` |\n`;
}

md += `\n---\n\n## 🌄 Provincial Cabinets\n`;

// Group by Province
const provMap = new Map();
for (const r of data.PROVINCE) {
  if (!provMap.has(r.unitName)) provMap.set(r.unitName, []);
  provMap.get(r.unitName).push(r);
}

for (const [pName, roles] of provMap.entries()) {
  md += `\n### ${pName} Provincial Cabinet\n\n`;
  md += `| Role Title | Officer Name | Login Email | Username | CNIC | Password |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of roles) {
    md += `| **${r.roleLabel}** | ${r.memberName} | \`${r.email}\` | \`${r.username}\` | \`${r.cnic}\` | \`123456\` |\n`;
  }
}

md += `\n---\n\n## 🏙️ District Cabinets (All 8 Districts)\n`;

// Group by District
const distMap = new Map();
for (const r of data.DISTRICT) {
  if (!distMap.has(r.unitName)) distMap.set(r.unitName, []);
  distMap.get(r.unitName).push(r);
}

for (const [dName, roles] of distMap.entries()) {
  md += `\n### District ${dName} Cabinet\n\n`;
  md += `| Role Title | Officer Name | Login Email | Username | CNIC | Password |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of roles) {
    md += `| **${r.roleLabel}** | ${r.memberName} | \`${r.email}\` | \`${r.username}\` | \`${r.cnic}\` | \`123456\` |\n`;
  }
}

md += `\n---\n\n## 🏘️ Area Cabinets (All 16 Areas)\n`;

// Group by Area
const areaMap = new Map();
for (const r of data.AREA) {
  if (!areaMap.has(r.unitName)) areaMap.set(r.unitName, []);
  areaMap.get(r.unitName).push(r);
}

for (const [aName, roles] of areaMap.entries()) {
  md += `\n### Area ${aName} Cabinet\n\n`;
  md += `| Role Title | Officer Name | Login Email | Username | CNIC | Password |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of roles) {
    md += `| **${r.roleLabel}** | ${r.memberName} | \`${r.email}\` | \`${r.username}\` | \`${r.cnic}\` | \`123456\` |\n`;
  }
}

const targetPath = path.join(__dirname, '../../../ADMIN_CREDENTIALS.md');
let adminCreds = fs.readFileSync(targetPath, 'utf8');

// Append or update cabinet directory reference in ADMIN_CREDENTIALS.md
const marker = '## 👔 Cabinet Roles & Portfolios (Central, Province, District, Area)';
if (adminCreds.includes(marker)) {
  adminCreds = adminCreds.split(marker)[0];
}

const fullDoc = adminCreds.trim() + '\n\n---\n\n' + md;
fs.writeFileSync(targetPath, fullDoc, 'utf8');

const cabinetOnlyPath = path.join(__dirname, '../../../CABINET_CREDENTIALS.md');
fs.writeFileSync(cabinetOnlyPath, md, 'utf8');

console.log('Successfully generated CABINET_CREDENTIALS.md and updated ADMIN_CREDENTIALS.md');
