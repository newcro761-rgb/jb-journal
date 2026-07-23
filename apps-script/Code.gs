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
  if (action === 'getThemeHistory') {
    return getThemeHistory_(ss, e.parameter.date, e.parameter.limit);
  }
  if (action === 'classifyTheme') {
    return classifyTheme_(e.parameter.name, e.parameter.code);
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

// ---- 오늘의 테마 (theme_daily.py, GitHub Actions 자동 실행) ----

function getThemeHistory_(ss, dateStr, limitStr) {
  const sheet = ss.getSheetByName('theme_daily');
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  const values = sheet.getDataRange().getValues();
  const out = [];
  const limit = limitStr ? Number(limitStr) : null;
  for (let i = values.length - 1; i >= 1; i--) {
    const r = values[i];
    if (!r[0]) continue;
    const d = normalizeDateStr_(r[0]);
    if (dateStr && d !== dateStr) continue;
    let parsed;
    try { parsed = JSON.parse(r[4]); } catch (e2) { continue; }
    out.push({ date: d, generatedAt: r[1], model: r[2], stockCount: r[3], groups: parsed.groups || [] });
    if (!dateStr && limit && out.length >= limit) break;
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ---- 매매계획 테마 자동분류 (Claude API) ----

// index.html의 THEME_OPTIONS와 동일한 목록이어야 한다 — 둘 중 하나를 바꾸면 반드시 같이 수정할 것.
var THEME_OPTIONS_ = ['반도체장비', '메모리반도체', 'AI반도체', '반도체소재부품', '2차전지', '바이오', '방산', '조선', '원전', '로봇', '소프트웨어/AI서비스', '사이버보안', '금융', '에너지/정유', '우주항공', '엔터', '화장품', '게임', '정치테마', '기타(미장무관)'];

function classifyTheme_(name, code) {
  try {
    if (!name || !code) {
      return ContentService.createTextOutput(JSON.stringify({ themes: [] })).setMimeType(ContentService.MimeType.JSON);
    }
    var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return ContentService.createTextOutput(JSON.stringify({ themes: [], error: 'no_api_key' })).setMimeType(ContentService.MimeType.JSON);
    }
    var payload = {
      model: 'claude-sonnet-5',
      max_tokens: 200,
      system: '너는 한국 주식 종목을 아래 20개 테마 카테고리 중 최대 2개로 분류하는 도우미다. ' +
        '테마 목록: ' + THEME_OPTIONS_.join(', ') + '. ' +
        '주어진 종목명/종목코드를 보고 가장 관련 있는 테마를 관련도 순으로 최대 2개 골라라. ' +
        '뚜렷하게 관련된 테마가 없으면 빈 배열을 반환해라. 반드시 위 목록에 있는 테마명만 그대로 사용해라. ' +
        '추가로, 왜 그 테마인지를 세분화해서 설명하는 아주 짧은 문구(15자 이내, 예: "정유 마진 확대", "HBM 후공정 장비")를 detail에 담아라. ' +
        '분류된 테마가 없으면 detail도 빈 문자열로 반환해라.',
      messages: [
        { role: 'user', content: '종목명: ' + name + ', 종목코드: ' + code }
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              themes: {
                type: 'array',
                items: { type: 'string', enum: THEME_OPTIONS_ }
              },
              detail: { type: 'string' }
            },
            required: ['themes', 'detail'],
            additionalProperties: false
          }
        }
      }
    };
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      // 디버깅용으로 API 응답 본문 앞부분을 같이 반환한다 — 원인 파악 후 나중에 줄여도 됨.
      return ContentService.createTextOutput(JSON.stringify({ themes: [], error: 'api_error_' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300) })).setMimeType(ContentService.MimeType.JSON);
    }
    var body = JSON.parse(res.getContentText());
    var textBlock = (body.content || []).filter(function (b) { return b.type === 'text'; })[0];
    if (!textBlock) {
      return ContentService.createTextOutput(JSON.stringify({ themes: [], error: 'no_text_block' })).setMimeType(ContentService.MimeType.JSON);
    }
    var parsed = JSON.parse(textBlock.text);
    return ContentService.createTextOutput(JSON.stringify({ themes: (parsed.themes || []).slice(0, 2), detail: parsed.detail || '' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ themes: [], error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
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

function backupSpreadsheet_(ss) {
  // 되돌릴 수 없는 정리 작업(deleteTradeRows/clearTradeData) 전에 호출 — 현재 스프레드시트
  // 전체를 Drive에 사본으로 복제한다(같은 폴더). 사본 URL을 응답으로 돌려준다.
  const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss');
  const copy = ss.copy(ss.getName() + ' backup-' + now);
  return { result: 'OK', url: copy.getUrl(), name: copy.getName() };
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

function saveThemeDaily_(ss, data) {
  // 같은 날짜 재실행(workflow_dispatch 재트리거 등) 시 중복 행 대신 덮어쓴다.
  let sheet = ss.getSheetByName('theme_daily');
  if (!sheet) {
    sheet = ss.insertSheet('theme_daily');
    sheet.appendRow(['date', 'generatedAt', 'model', 'stockCount', 'raw_json']);
  }
  const values = sheet.getDataRange().getValues();
  const row = [data.date, data.generatedAt || '', data.model || '', data.stockCount || 0, JSON.stringify(data)];
  for (let i = 1; i < values.length; i++) {
    if (normalizeDateStr_(values[i][0]) === data.date) {
      sheet.getRange(i + 1, 1, 1, 5).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
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

  if (data.type === 'backupSpreadsheet') {
    const res = backupSpreadsheet_(ss);
    return ContentService.createTextOutput(JSON.stringify(res))
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

  if (data.type === 'theme-save') {
    saveThemeDaily_(ss, data);
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
