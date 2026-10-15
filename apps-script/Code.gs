/**
 * 哪天有空露營：Google 試算表後端
 *
 * 試算表「people」工作表欄位：id | name | dates | updatedAt
 * dates 以逗號分隔的 YYYY-MM-DD 字串存放。
 *
 * GET  → 回傳所有人
 * POST → {action:"save", id, name, dates[]} 或 {action:"delete", id}，回傳所有人
 */

const SHEET_NAME = 'people';
const HEADERS = ['id', 'name', 'dates', 'updatedAt'];
const MAX_PEOPLE = 200;
const MAX_DATES = 366;
const ID_RE = /^[a-z0-9]{6,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function doGet() {
  return json_({ ok: true, rows: readRows_() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const id = String(body.id || '');
    if (!ID_RE.test(id)) return json_({ ok: false, error: 'bad id' });

    const sheet = sheet_();
    const ids = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(r => String(r[0]))
      : [];
    const rowIndex = ids.indexOf(id); // -1 = 新的人

    if (body.action === 'delete') {
      if (rowIndex >= 0) sheet.deleteRow(rowIndex + 2);
    } else if (body.action === 'save') {
      const name = String(body.name || '').trim().slice(0, 20);
      if (!name) return json_({ ok: false, error: 'name required' });
      const dates = (Array.isArray(body.dates) ? body.dates : [])
        .map(String).filter(d => DATE_RE.test(d)).slice(0, MAX_DATES).sort();
      const row = [id, name, dates.join(','), new Date().toISOString()];
      if (rowIndex >= 0) {
        sheet.getRange(rowIndex + 2, 1, 1, HEADERS.length).setValues([row]);
      } else {
        if (ids.length >= MAX_PEOPLE) return json_({ ok: false, error: 'too many people' });
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length).setValues([row]);
      }
    } else {
      return json_({ ok: false, error: 'bad action' });
    }
    return json_({ ok: true, rows: readRows_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  // 整張表存純文字，避免單一日期被自動轉成日期格式
  sheet.getRange('A:D').setNumberFormat('@');
  return sheet;
}

function readRows_() {
  const sheet = sheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getDisplayValues()
    .filter(r => r[0] && r[1])
    .map(r => ({ id: r[0], name: r[1], dates: r[2] ? r[2].split(',') : [], updatedAt: r[3] }));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
