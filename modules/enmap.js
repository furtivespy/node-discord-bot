const Module = require("node:module");

// Enmap 5 requires better-sqlite3/lib/database, which newer better-sqlite3
// releases no longer export. The package root is the same Database class.
const originalLoad = Module._load;
Module._load = function patchBetterSqlite3(request, parent, isMain) {
  if (request === "better-sqlite3/lib/database") {
    request = "better-sqlite3";
  }
  return originalLoad.call(this, request, parent, isMain);
};

const Enmap = require("enmap");
Module._load = originalLoad;

module.exports = Enmap;
