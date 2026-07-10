function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = e.parameter && e.parameter.action;

  if (action === 'getTodayPlans') {
    return getTodayPlans_(ss, e.parameter.date);
  }
  if (action === 'getPremarketCheck') {
    return getPremarketCheck_(ss, e.parameter.date);
  }
  if (action === 'getTrades') {
    return getTrades_(ss);
  }
  if (action === 'getCapital') {
    return getCapital_(ss);
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

// ---- 키움 자동 매매일지 동기화 (읽기 전용 조회 데이터만 기록 — 주문 관련 아님) ----

function getTrades_(ss) {
  const sheet = ss.getSheetByName('trades');
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue;
    out.push({
      tradeId: r[0], stkCd: r[1], stkNm: r[2], status: r[3],
      buys: r[4] ? JSON.parse(r[4]) : [],
      avgPrice: r[5],
      sells: r[6] ? JSON.parse(r[6]) : [],
      totalPl: r[7], totalReturnPct: r[8], winLoss: r[9], holdingDays: r[10],
      finalHigh: r[11] || null, finalLow: r[12] || null, finalClose: r[13] || null,
      finalDeviationPct: r[14] || null, updatedAt: r[15],
      manual: {
        차수: r[16] || '', 손절청산사유: r[17] || '', 규칙준수: r[18] || '',
        테마: r[19] || '', 메모: r[20] || '',
        제외: r[21] === true || r[21] === 'true'
      }
    });
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function getCapital_(ss) {
  const sheet = ss.getSheetByName('capital');
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0]) continue;
    out.push({ date: normalizeDateStr_(r[0]), amount: r[1], note: r[2] || '' });
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function saveFills_(ss, fills) {
  let sheet = ss.getSheetByName('fills');
  if (!sheet) {
    sheet = ss.insertSheet('fills');
    sheet.appendRow(['체결일시', '종목코드', '종목명', '매수매도', '체결가', '수량', '주문번호', '거래소구분', '수집일시']);
    // 체결일시/종목코드/주문번호는 0-패딩 숫자 형태 문자열이라 텍스트 포맷을 안 걸면 Sheets가 자동으로
    // 숫자로 바꿔 앞자리 0을 지워버린다(예: "0000429"→429) — 멱등성 키(주문번호 포함)가 깨지는 원인이었다.
    sheet.getRange('A2:A').setNumberFormat('@');
    sheet.getRange('B2:B').setNumberFormat('@');
    sheet.getRange('G2:G').setNumberFormat('@');
  }
  const values = sheet.getDataRange().getValues();
  const existingKeys = {};
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    existingKeys[r[6] + '|' + r[0] + '|' + r[4] + '|' + r[5]] = true; // 주문번호|체결일시|체결가|수량
  }
  const now = new Date().toISOString();
  const rows = [];
  (fills || []).forEach(function (f) {
    const key = f.ordNo + '|' + f.cntrDt + '|' + f.price + '|' + f.qty;
    if (existingKeys[key]) return; // 서버 측 최종 멱등성 가드 — 클라이언트 재시도로 중복 전송돼도 여기서 막힘
    existingKeys[key] = true;
    rows.push([f.cntrDt, f.stkCd, f.stkNm, f.side, f.price, f.qty, f.ordNo, f.dmstStexTp || '', now]);
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
  }
  return rows.length;
}

function saveTrades_(ss, trades) {
  let sheet = ss.getSheetByName('trades');
  if (!sheet) {
    sheet = ss.insertSheet('trades');
    sheet.appendRow([
      'trade_id', '종목코드', '종목명', '상태', '매수내역_json', '평균단가', '매도내역_json',
      '총실현손익', '총수익률', '승패', '보유기간일', '최종매도일_고가', '최종매도일_저가',
      '최종매도일_종가', '최종매도가_이격률', 'updated_at',
      '자리차수', '손절청산사유', '규칙준수', '테마', '메모', '통계제외'
    ]);
    sheet.getRange('B2:B').setNumberFormat('@'); // 종목코드 — 0-패딩 숫자 문자열 자동변환 방지
  }
  const values = sheet.getDataRange().getValues();
  const rowByTradeId = {};
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) rowByTradeId[String(values[i][0])] = i + 1;
  }
  const now = new Date().toISOString();
  (trades || []).forEach(function (t) {
    // A~P(자동 16열)만 쓴다 — Q~U(수동 5열)는 새 행이면 비워두고, 기존 행이면 절대 건드리지 않는다.
    const autoRow = [
      t.tradeId, t.stkCd, t.stkNm, t.status,
      JSON.stringify(t.buys || []), t.avgPrice,
      JSON.stringify(t.sells || []),
      t.totalPl, t.totalReturnPct, t.winLoss, t.holdingDays,
      t.finalHigh != null ? t.finalHigh : '', t.finalLow != null ? t.finalLow : '',
      t.finalClose != null ? t.finalClose : '', t.finalDeviationPct != null ? t.finalDeviationPct : '',
      now
    ];
    const existingRow = rowByTradeId[String(t.tradeId)];
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, 16).setValues([autoRow]);
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, 16).setValues([autoRow]);
    }
  });
}

function updateTradeManual_(ss, data) {
  const sheet = ss.getSheetByName('trades');
  if (!sheet) return false;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.tradeId)) {
      sheet.getRange(i + 1, 17, 1, 6).setValues([[
        data.차수 || '', data.손절청산사유 || '', data.규칙준수 || '', data.테마 || '', data.메모 || '',
        data.제외 === true || data.제외 === 'true'
      ]]);
      return true;
    }
  }
  return false;
}

function deleteTradeRows_(ss, tradeIds) {
  // 중복행 정리용 — 정확히 일치하는 tradeId 행만 trades 시트에서 삭제한다. fills 시트는 건드리지
  // 않는다(fills는 ordNo|cntrDt|price|qty 멱등성 가드가 이미 있어 진짜 중복이 아니고, trade
  // 요약 재계산에 필요한 원본 체결 이력이라 보존).
  const sheet = ss.getSheetByName('trades');
  if (!sheet) return 0;
  const idSet = {};
  (tradeIds || []).forEach(function (id) { idSet[String(id)] = true; });
  const values = sheet.getDataRange().getValues();
  let deleted = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (idSet[String(values[i][0])]) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return deleted;
}

function clearTradeData_(ss, confirm) {
  // 계좌 재백필 전 초기화용 — trades/fills 시트의 데이터 행을 전부 지운다(헤더는 유지).
  // capital(입출금) 시트는 건드리지 않는다. 되돌릴 수 없으므로 confirm 토큰이 정확히 일치할
  // 때만 실행한다.
  if (confirm !== 'CLEAR_TRADE_DATA') return { result: 'CONFIRM_MISMATCH' };
  ['trades', 'fills'].forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  });
  return { result: 'OK' };
}

function saveCapital_(ss, data) {
  let sheet = ss.getSheetByName('capital');
  if (!sheet) {
    sheet = ss.insertSheet('capital');
    sheet.appendRow(['날짜', '금액', '메모']);
    sheet.getRange('A2:A').setNumberFormat('@');
  }
  sheet.appendRow([data.date, data.amount, data.note || '']);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = JSON.parse(e.postData.contents);

  if (data.type === 'saveFills') {
    const inserted = saveFills_(ss, data.fills);
    return ContentService.createTextOutput(JSON.stringify({result:'OK', inserted: inserted}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'saveTrades') {
    saveTrades_(ss, data.trades);
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'updateTradeManual') {
    const found = updateTradeManual_(ss, data);
    return ContentService.createTextOutput(JSON.stringify({result: found ? 'OK' : 'NOT_FOUND'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'deleteTradeRows') {
    const deleted = deleteTradeRows_(ss, data.tradeIds);
    return ContentService.createTextOutput(JSON.stringify({result:'OK', deleted: deleted}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'clearTradeData') {
    const res = clearTradeData_(ss, data.confirm);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (data.type === 'saveCapital') {
    saveCapital_(ss, data);
    return ContentService.createTextOutput(JSON.stringify({result:'OK'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

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
