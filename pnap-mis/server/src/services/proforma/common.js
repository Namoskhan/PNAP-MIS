const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const fontRegularPath = path.resolve(__dirname, '../../../assets/fonts/NotoNaskhArabic-Regular.ttf');
const fontBoldPath = path.resolve(__dirname, '../../../assets/fonts/NotoNaskhArabic-Bold.ttf');

let fontRegularB64 = '';
let fontBoldB64 = '';
if (fs.existsSync(fontRegularPath)) {
  fontRegularB64 = fs.readFileSync(fontRegularPath).toString('base64');
}
if (fs.existsSync(fontBoldPath)) {
  fontBoldB64 = fs.readFileSync(fontBoldPath).toString('base64');
}

const PASHTO_MONTHS = [
  'جنوري', 'فبروري', 'مارچ', 'اپريل', 'مۍ', 'جون',
  'جولای', 'اګست', 'سپتمبر', 'اکتوبر', 'نومبر', 'دسمبر'
];

function getPashtoMonth(m) {
  const idx = parseInt(m, 10) - 1;
  return PASHTO_MONTHS[idx] || String(m);
}

function getBaseCss() {
  return `
    @font-face {
      font-family: 'Noto Naskh Arabic';
      font-style: normal;
      font-weight: 400;
      src: url(data:font/truetype;charset=utf-8;base64,${fontRegularB64}) format('truetype');
    }
    @font-face {
      font-family: 'Noto Naskh Arabic';
      font-style: normal;
      font-weight: 700;
      src: url(data:font/truetype;charset=utf-8;base64,${fontBoldB64}) format('truetype');
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #ffffff;
      font-family: 'Noto Naskh Arabic', Arial, Tahoma, sans-serif;
      font-size: 8pt;
      line-height: 1.1;
      color: #000000;
      direction: rtl;
    }

    .page-container {
      width: 100%;
      padding: 0 2px;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
      padding: 0 4px;
    }

    .header-field {
      font-size: 9.5pt;
      font-weight: 700;
      white-space: nowrap;
    }

    .header-field .line {
      display: inline-block;
      min-width: 160px;
      border-bottom: 1px solid #000;
      margin-right: 4px;
      text-align: center;
      font-weight: 600;
      font-size: 9.5pt;
    }

    .report-title {
      font-size: 13pt;
      font-weight: 700;
      text-align: center;
      flex: 1;
      margin: 0 10px;
    }

    table.proforma-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 6.8pt;
      border: 1.5px solid #000000;
      margin-bottom: 10px;
    }

    table.proforma-table th,
    table.proforma-table td {
      border: 0.75px solid #000000;
      padding: 1.5px 0.5px;
      text-align: center;
      vertical-align: middle;
      overflow: hidden;
      line-height: 1.05;
    }

    table.proforma-table th {
      font-weight: 700;
      background: #ffffff;
      color: #000;
      padding-top: 3px;
      padding-bottom: 3px;
    }

    table.proforma-table td {
      height: 24px;
      font-size: 7.2pt;
    }

    .table-section-title {
      font-size: 10.5pt;
      font-weight: 700;
      text-align: center;
      text-decoration: underline;
      margin: 8px 0 4px 0;
    }

    .nowrap {
      white-space: nowrap;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page-container {
        padding: 0;
      }
    }
  `;
}

function getBrowserPath() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return 'chrome';
}

function renderHtmlToImage(htmlPath, outPngPath) {
  const chromePath = getBrowserPath();
  const cmd = `"${chromePath}" --headless --disable-gpu --screenshot="${outPngPath}" --window-size=1600,1130 "file:///${htmlPath.replace(/\\\\/g, '/')}"`;
  execSync(cmd, { stdio: 'pipe' });
}

function renderHtmlToPdf(htmlPath, outPdfPath) {
  const chromePath = getBrowserPath();
  const cmd = `"${chromePath}" --headless --disable-gpu --print-to-pdf="${outPdfPath}" --print-to-pdf-no-header "file:///${htmlPath.replace(/\\\\/g, '/')}"`;
  execSync(cmd, { stdio: 'pipe' });
}

module.exports = {
  getPashtoMonth,
  getBaseCss,
  renderHtmlToImage,
  renderHtmlToPdf,
};
