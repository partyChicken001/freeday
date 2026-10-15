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

function doGet(e) {
  const month = e && e.parameter && e.parameter.camp;
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return json_({ ok: false, error: 'bad month' });
    return json_({ ok: true, days: campMonth_(month) });
  }
  return json_({ ok: true, rows: readRows_() });
}

/**
 * 在編輯器選這個函式按「執行」：完成連外網授權，並在執行記錄看到 12 月的營位結果。
 */
function testCamp() {
  CacheService.getScriptCache().remove('camp:2026-12-19');
  const days = campMonth_('2026-12');
  Object.keys(days).sort().forEach(d => {
    Logger.log(d + ' 可訂 ' + days[d].remaining + '／空 ' + days[d].free.length + '／全場 ' + days[d].total +
      (days[d].unassigned ? '（未分配 ' + days[d].unassigned + '）' : '') + (days[d].partial ? '（API 抓不到）' : ''));
  });
  Logger.log('共 ' + Object.keys(days).length + ' 天');
}

// ---------- 小路露營區營位狀況 ----------
// 來源一：官網訂位表 food_detail.asp（Big5），已訂的格子含 order.gif
// 來源二：官網頁面自己會合併的公開 API（已匯款訂位），規則照官網頁面的腳本：
//   - API 列對到官網營位名稱 → 該營位已訂
//   - API 列沒有對應營位 → 算一筆「未分配營位」的訂位
//   - 官網已訂列的 data-id 在 superseded 裡、且 API 沒重新宣告 → 視為空出
const CAMP_PAGE = 'https://www.nalu.com.tw/food_detail.asp?cdate=';
const CAMP_API = 'https://nalucamp.synology.me/worklog/api/cs/public/occupancy?date=';
const CAMP_CACHE_SEC = 20 * 60;

function campMonth_(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const dates = [];
  for (let d = 1; d <= last; d++) {
    const iso = month + '-' + String(d).padStart(2, '0');
    if (iso >= today) dates.push(iso);
  }

  const cache = CacheService.getScriptCache();
  const cached = dates.length ? cache.getAll(dates.map(d => 'camp:' + d)) : {};
  const out = {};
  const todo = [];
  dates.forEach(d => {
    const hit = cached['camp:' + d];
    if (hit) out[d] = JSON.parse(hit); else todo.push(d);
  });
  if (!todo.length) return out;

  const reqs = [];
  todo.forEach(d => {
    reqs.push({ url: CAMP_PAGE + d.replace(/-/g, '/'), muteHttpExceptions: true });
    reqs.push({ url: CAMP_API + d, muteHttpExceptions: true, headers: { Origin: 'https://www.nalu.com.tw' } });
  });
  const res = UrlFetchApp.fetchAll(reqs);
  const toCache = {};
  todo.forEach((d, i) => {
    const page = res[i * 2], api = res[i * 2 + 1];
    if (page.getResponseCode() !== 200) return; // 抓不到就不回傳這天，前端顯示空白
    let apiJson = null;
    try {
      if (api.getResponseCode() === 200) {
        const j = JSON.parse(api.getContentText());
        if (j && j.date === d && Array.isArray(j.rows) && Array.isArray(j.superseded)) apiJson = j;
      }
    } catch (err) { /* API 掛掉就只用官網表 */ }
    const day = campDay_(page.getContentText('Big5'), apiJson);
    if (!day) return;
    out[d] = day;
    toCache['camp:' + d] = JSON.stringify(day);
  });
  if (Object.keys(toCache).length) cache.putAll(toCache, CAMP_CACHE_SEC);
  return out;
}

function campDay_(html, api) {
  if (typeof html !== 'string') return null;
  const table = html.match(/<table[^>]*id="occ"[^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return null;
  const base = [];
  const rowRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(table[1]))) {
    // 官網已訂的格子沒有 </td>，所以用 <td 切欄位而不是成對比對
    const cells = r[2].split(/<td\b/i).slice(1);
    if (cells.length < 2) continue; // 第一列是日期標題
    const idm = r[1].match(/data-id="([^"]*)"/i);
    const name = stripTags_('<td' + cells[0]);
    if (!name) continue;
    base.push({ name, key: campNorm_(name), id: idm ? idm[1] : '', booked: /order\.gif/i.test(cells[1]) });
  }
  if (!base.length) return null;

  const booked = base.map(b => b.booked);
  let unassigned = 0;
  if (api) {
    const sup = {};
    api.superseded.forEach(n => { sup[String(n)] = true; });
    const asserted = {};
    api.rows.forEach(x => {
      const key = x && typeof x.official === 'string' ? campNorm_(x.official) : '';
      const hits = key ? base.map((b, i) => (b.key === key ? i : -1)).filter(i => i >= 0) : [];
      if (hits.length) { asserted[key] = true; hits.forEach(i => { booked[i] = true; }); }
      else unassigned++;
    });
    base.forEach((b, i) => {
      if (b.id && sup[b.id] && !asserted[b.key]) booked[i] = false;
    });
  }
  const free = base.filter((b, i) => !booked[i]).map(b => b.name);
  return {
    total: base.length,
    free,
    unassigned,
    remaining: Math.max(0, free.length - unassigned),
    partial: !api,
    at: new Date().toISOString()
  };
}

function campNorm_(s) {
  s = String(s || '');
  try { s = s.normalize('NFKC'); } catch (e) {}
  return s.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48));
}

function stripTags_(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
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
