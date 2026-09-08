import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBggSearchXml, parseBggDetailsXml } from "../modules/bggXmlParser.js";
import { XMLParser } from "fast-xml-parser";

function findBy(arr, pred) {
  const entries = Object.entries(pred);
  return arr.find((item) => entries.every(([key, value]) => item[key] === value));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", "bgg", name), "utf8");

describe("bggXmlParser", () => {
  it("loads XMLParser via ESM import from fast-xml-parser", () => {
    assert.equal(typeof XMLParser, "function");
  });

  it("exposes search fields BoardGameGeek.Search reads", () => {
    const parsed = parseBggSearchXml(fixture("search-multi.xml"));
    assert.ok(Array.isArray(parsed.items.item));
    assert.equal(String(parsed.items.item[0].id), "13");
    assert.equal(parsed.items.item[0].name.type, "primary");
    assert.equal(parsed.items.item[0].name.value, "CATAN");
    assert.equal(String(parsed.items.item[0].yearpublished.value), "1995");
    assert.ok(Array.isArray(parsed.items.item[1].name));
    assert.equal(parsed.items.item[1].name.find((n) => n.type === "primary").value, "Catan Card Game");
  });

  it("keeps a single search hit as an object, not an array", () => {
    const parsed = parseBggSearchXml(fixture("search-single.xml"));
    assert.equal(Array.isArray(parsed.items.item), false);
    assert.equal(String(parsed.items.item.id), "230802");
    assert.equal(parsed.items.item.name.value, "Azul");
    assert.equal(String(parsed.items.item.yearpublished.value), "2017");
  });

  it("keeps details fields BoardGameGeek.LoadBggData / embeds read", () => {
    const gameInfo = parseBggDetailsXml(fixture("boardgame-multi-name.xml")).boardgames.boardgame;

    assert.ok(Array.isArray(gameInfo.name));
    assert.equal(typeof findBy(gameInfo.name, { primary: "true" }).text, "string");
    assert.equal(findBy(gameInfo.name, { primary: "true" }).text, "Catan");
    assert.equal(findBy(gameInfo.name, { primary: "true" }).primary, "true");

    assert.equal(gameInfo.yearpublished, 1995);
    assert.equal(gameInfo.minplayers, 3);
    assert.equal(gameInfo.maxplayers, 4);
    assert.equal(gameInfo.minplaytime, 60);
    assert.equal(gameInfo.maxplaytime, 120);
    assert.equal(gameInfo.age, 10);
    assert.equal(gameInfo.statistics.ratings.average, 7.21);
    assert.equal(gameInfo.statistics.ratings.averageweight, 2.33);
    assert.equal(gameInfo.image, "https://example.com/image.jpg");
    assert.match(gameInfo.description, /dominant force/);

    assert.ok(Array.isArray(gameInfo.statistics.ratings.ranks.rank));
    assert.equal(gameInfo.statistics.ratings.ranks.rank[0].friendlyname, "Board Game Rank");
    assert.equal(String(gameInfo.statistics.ratings.ranks.rank[0].value), "400");

    assert.equal(gameInfo.boardgamedesigner.text, "Klaus Teuber");
    assert.deepEqual(gameInfo.boardgamepublisher.map((p) => p.text), ["Kosmos", "Mayfair Games"]);
    assert.deepEqual(gameInfo.boardgamemechanic.map((m) => m.text), ["Dice Rolling", "Trading"]);
    assert.equal(gameInfo.boardgameexpansion.text, "Catan: Cities & Knights");
    assert.equal(String(gameInfo.boardgameexpansion.objectid), "926");
    assert.deepEqual(gameInfo.boardgamehonor.map((h) => h.text), [
      "1996 Spiel des Jahres Winner",
      "1995 Origins Award",
    ]);

    const suggested = findBy(gameInfo.poll, { name: "suggested_numplayers" });
    suggested.results.forEach((r) => {
      r.result.sort((a, b) => b.numvotes - a.numvotes);
    });
    assert.equal(String(suggested.results[0].numplayers), "1");
    assert.equal(suggested.results[0].result[0].value, "Not Recommended");
    assert.equal(String(suggested.results[1].numplayers), "4");
    assert.equal(suggested.results[1].result[0].value, "Best");
  });

  it("keeps a single primary name as an object with .text", () => {
    const gameInfo = parseBggDetailsXml(fixture("boardgame-single-name.xml")).boardgames.boardgame;
    assert.equal(Array.isArray(gameInfo.name), false);
    assert.equal(gameInfo.name.text, "Solo Title");
    assert.equal(gameInfo.name.primary, "true");
    assert.equal(Array.isArray(gameInfo.statistics.ratings.ranks.rank), false);
    assert.equal(gameInfo.statistics.ratings.ranks.rank.friendlyname, "Board Game Rank");
    assert.equal(gameInfo.boardgamepublisher.text, "One Pub");
  });
});
