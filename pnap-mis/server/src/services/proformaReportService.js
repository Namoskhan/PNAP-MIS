const { renderHtmlToImage, renderHtmlToPdf } = require('./proforma/common');
const form1 = require('./proforma/form1');
const form2 = require('./proforma/form2');
const form3 = require('./proforma/form3');
const form4 = require('./proforma/form4');
const form5 = require('./proforma/form5');

module.exports = {
  // Common utilities
  renderHtmlToImage,
  renderHtmlToPdf,

  // Form 1: Area Unit Work & Activity Monthly Report
  fetchForm1Data: form1.fetchForm1Data,
  generateForm1Html: form1.generateForm1Html,
  generateForm1Excel: form1.generateForm1Excel,

  // Form 2: Basic Units Monthly Work & Activity Report
  fetchForm2Data: form2.fetchForm2Data,
  generateForm2Html: form2.generateForm2Html,
  generateForm2Excel: form2.generateForm2Excel,

  // Form 3: Area Detailed Activity Report (Multi-section)
  fetchForm3Data: form3.fetchForm3Data,
  generateForm3Html: form3.generateForm3Html,
  generateForm3Excel: form3.generateForm3Excel,

  // Form 4: Basic Unit Work & Activity Monthly Report
  fetchForm4Data: form4.fetchForm4Data,
  generateForm4Html: form4.generateForm4Html,
  generateForm4Excel: form4.generateForm4Excel,

  // Form 5: Provincial Executive Individual Activity Report
  fetchForm5Data: form5.fetchForm5Data,
  generateForm5Html: form5.generateForm5Html,
  generateForm5Excel: form5.generateForm5Excel,
};
