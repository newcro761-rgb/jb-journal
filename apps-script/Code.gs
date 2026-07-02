function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter && e.parameter.action;

  if (action === 'getTodayPlans') {
    return getTodayPlans_(ss, e.parameter.date);
  }
  if (action === 'getPremarketCheck') {
    return getPremarketCheck_(ss, e.parameter.date);
  }

  const sheet = ss.getSheetByName('Plans');
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const values = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify(values)).setMimeType(ContentService.MimeType.JSON);
}

function normalizeDateStr_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '');
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return s;
}

function getTodayPlans_(ss, dateStr) {
  const sheet = ss.getSheetByName('Plans');
  if (!sheet || !dateStr) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue;
    if (normalizeDateStr_(r[1]) !== dateStr) continue;
    out.push({
      id: r[0], date: r[1], name: r[2], ticker: r[3],
      entry1: r[4], qty1: r[5], entry2: r[6] || null, qty2: r[7] || null,
      stop: r[8] || null,
      themes: r[12] ? JSON.parse(r[12]) : []
    });
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function getPremarketCheck_(ss, dateStr) {
  const sheet = ss.getSheetByName('premarket_checks');
  if (!sheet || !dateStr) return ContentService.createTextOutput('null').setMimeType(ContentService.MimeType.JSON);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (normalizeDateStr_(values[i][0]) === dateStr) {
      return ContentService.createTextOutput(values[i][2]).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput('null').setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(e.postData.contents);

  if (data.type === 'plan-save') {
    let sheet = ss.getSheetByName('Plans');
    if (!sheet) sheet = ss.insertSheet('Plans');
    sheet.getRange('B2:B').setNumberFormat('@');
    const p = data.plan;
    sheet.appendRow([
      p.id, p.date, p.name, p.code,
      p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
      JSON.stringify(p.sells || []),
      p.use2 === undefined ? '' : p.use2,
      p.regime || '',
      JSON.stringify(p.themes || [])
    ]);
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'plan-update') {
    let sheet = ss.getSheetByName('Plans');
    if (!sheet) return ContentService.createTextOutput('OK');
    const p = data.plan;
    const values = sheet.getDataRange().getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(p.id)) {
        sheet.getRange(i + 1, 1, 1, 13).setValues([[
          p.id, p.date, p.name, p.code,
          p.b1, p.q1, p.b2 || '', p.q2 || '', p.custSL || '',
          JSON.stringify(p.sells || []),
          p.use2 === undefined ? '' : p.use2,
          p.regime || '',
          JSON.stringify(p.themes || [])
        ]]);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'plan-delete') {
    let sheet = ss.getSheetByName('Plans');
    if (!sheet) return ContentService.createTextOutput('OK');
    const values = sheet.getDataRange().getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]) === String(data.id)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'premarket-check-save') {
    let sheet = ss.getSheetByName('premarket_checks');
    if (!sheet) {
      sheet = ss.insertSheet('premarket_checks');
      sheet.appendRow(['date', 'checkedAt', 'raw_json']);
    }
    sheet.appendRow([data.date, data.checkedAt || '', JSON.stringify(data)]);
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 거래 저장 (기존 — 30열 row, 변경 없음)
  const sheet = ss.getActiveSheet();
  sheet.appendRow(data.row);
  return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
    .setMimeType(ContentService.MimeType.JSON);
}
