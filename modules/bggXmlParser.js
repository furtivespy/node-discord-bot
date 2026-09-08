import { XMLParser } from "fast-xml-parser";

// fast-xml-parser v5 is ESM-first (`"type": "module"`). This module is the
// only place the bot loads the parser so a parser swap can stay isolated.
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

export { parseBggSearchXml, parseBggDetailsXml };
