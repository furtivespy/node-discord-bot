const { XMLParser } = require("fast-xml-parser");

// fast-xml-parser v5 is ESM-first (`"type": "module"`) but still ships a
// CommonJS export (`exports.require` → lib/fxp.cjs). This module is the only
// place the bot loads the parser so a future ESM-only drop can be isolated.
// `ignoreNameSpace` was renamed to `removeNSPrefix` in v4; BGG XML has no
// namespaces, so this is a no-op for current payloads.
const sharedParserOptions = {
  attributeNamePrefix: "",
  ignoreAttributes: false,
  removeNSPrefix: true,
  allowBooleanAttributes: true,
};

function parseBggSearchXml(text) {
  return new XMLParser(sharedParserOptions).parse(text);
}

function parseBggDetailsXml(text) {
  return new XMLParser({
    ...sharedParserOptions,
    textNodeName: "text",
  }).parse(text);
}

module.exports = {
  parseBggSearchXml,
  parseBggDetailsXml,
};
