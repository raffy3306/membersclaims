const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('GoogleAppsScript.gs', 'utf8');

function scenario(mode) {
  const properties = new Map();
  const records = [
    ['Email', 'Password', 'Role', 'Fullname'],
    ['admin@example.com', 'pbkdf2$hash-preserved', 'admin', 'Admin User']
  ];
  const original = JSON.stringify(records);
  let destinationRows = [];
  let creates = 0;
  const oldSheet = {
    getDataRange: () => ({ getValues: () => records }),
    getLastRow: () => 1,
    getRange: () => ({ getValues: () => [['Email', 'Password', 'Role', 'Fullname']] })
  };
  const targetSheet = {
    setName() {},
    getRange(row, col, count, width) {
      return {
        setValues(batch) {
          if (mode === 'write') throw Error('write rejected');
          batch.forEach((values, i) => { destinationRows[row - 1 + i] = [...values]; });
        },
        getValues() {
          const data = destinationRows.slice(row - 1, row - 1 + count)
            .map(values => values.slice(col - 1, col - 1 + width));
          if (mode === 'verify') data[1][1] = 'corrupted';
          return data;
        }
      };
    }
  };
  const oldBook = {
    getSpreadsheetTimeZone: () => 'Asia/Manila',
    getSheets: () => [oldSheet],
    insertSheet: () => oldSheet
  };
  const newBook = {
    getId: () => 'new-users-book',
    getUrl: () => 'new-users-url',
    getSheets: () => [targetSheet],
    setSpreadsheetTimeZone(zone) { assert.equal(zone, 'Asia/Manila'); }
  };
  const ctx = vm.createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => properties.get(key),
        setProperty: (key, value) => properties.set(key, value)
      })
    },
    SpreadsheetApp: {
      create() { creates++; return newBook; },
      openById(id) { assert.equal(id, 'new-users-book'); return newBook; },
      flush() {}
    },
    Logger: { log() {} }
  });
  vm.runInContext(source, ctx);
  ctx.withScriptLock = fn => fn();
  ctx.getSpreadsheet = () => oldBook;
  ctx.getSheetByNameFlexible = (book, name) => {
    if (book === oldBook && name === 'Users') return oldSheet;
    if (book === newBook && name === 'Users') return targetSheet;
    return null;
  };
  ctx.ensureHeaders = () => {};

  if (mode) {
    assert.throws(() => ctx.recoverUsersStorage());
    assert.equal(properties.get('USERS_SHEET_ID'), undefined);
    assert.equal(properties.get('USERS_RECOVERY_CANDIDATE_ID'), 'new-users-book');
  } else {
    assert.equal(ctx.recoverUsersStorage(), 'new-users-url');
    assert.equal(JSON.stringify(destinationRows), original);
    assert.equal(properties.get('USERS_SHEET_ID'), 'new-users-book');
    assert.equal(ctx.recoverUsersStorage(), 'new-users-url');
    assert.equal(creates, 1);
    assert.equal(ctx.getSheet('Users', []), targetSheet);
    assert.equal(ctx.getSheet('Members', []), oldSheet);
  }
  assert.equal(JSON.stringify(records), original);
}

scenario();
scenario('write');
scenario('verify');
console.log('PASS: exact user copy including password values, verified activation, repeat safety, Users-only routing, source unchanged, and no activation on copy/verification failure.');
