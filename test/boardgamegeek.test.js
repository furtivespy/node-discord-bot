import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "he";
import { parseBggSearchXml, parseBggDetailsXml } from "../modules/bggXmlParser.js";
import BoardGameGeek from "../modules/boardgamegeek.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", "bgg", name), "utf8");

function xmlFetch(xml) {
  return async () => ({
    ok: true,
    text: async () => xml,
  });
}

describe("BoardGameGeek.isEphemeral", () => {
  it("treats omitted details as public and only ALLEPHEMERAL as ephemeral", () => {
    assert.equal(BoardGameGeek.isEphemeral(null), false);
    assert.equal(BoardGameGeek.isEphemeral(undefined), false);
    assert.equal(BoardGameGeek.isEphemeral(BoardGameGeek.DetailsEnum.ALL), false);
    assert.equal(BoardGameGeek.isEphemeral(BoardGameGeek.DetailsEnum.BASIC), false);
    assert.equal(BoardGameGeek.isEphemeral(BoardGameGeek.DetailsEnum.AWARDS), false);
    assert.equal(BoardGameGeek.isEphemeral(BoardGameGeek.DetailsEnum.ALLEPHEMERAL), true);
  });
});

describe("he 2.x named exports", () => {
  it("exports decode as a named export and has no default export", async () => {
    const he = await import("he");
    assert.equal(he.default, undefined);
    assert.equal(typeof he.decode, "function");
    assert.equal(typeof decode, "function");
    assert.equal(decode("a &amp; b &#039;c&#039; &quot;d&quot;"), `a & b 'c' "d"`);
  });
});

describe("BoardGameGeek HTML entity decoding", () => {
  it("decodes &amp;, &#039;, and &quot; in Search result names", async () => {
    const xml = fixture("search-entities.xml");
    const encodedName = parseBggSearchXml(xml).items.item.name.value;
    assert.match(encodedName, /&amp;/);
    assert.match(encodedName, /&#039;/);
    assert.match(encodedName, /&quot;/);

    const results = await BoardGameGeek.Search("tom", undefined, xmlFetch(xml));
    assert.equal(results.length, 1);
    assert.equal(results[0].name, `Tom & Jerry: That's All Folks "Quote" (2020)`);
    assert.equal(results[0].value, "9999");
    assert.doesNotMatch(results[0].name, /&amp;|&#039;|&quot;/);
  });

  it("decodes &amp;, &#039;, and &quot; in LoadBggData game names", async () => {
    const xml = fixture("boardgame-multi-name.xml").replace(
      '<name primary="true">Catan</name>',
      '<name primary="true">Tom &amp;amp; Jerry&amp;#039;s &amp;quot;Catan&amp;quot;</name>'
    );
    const encodedName = parseBggDetailsXml(xml).boardgames.boardgame.name.find(
      (n) => n.primary === "true"
    ).text;
    assert.match(encodedName, /&amp;/);
    assert.match(encodedName, /&#039;/);
    assert.match(encodedName, /&quot;/);

    const bgg = new BoardGameGeek("13", { config: {} }, {});
    await bgg.LoadBggData(xmlFetch(xml));
    assert.equal(bgg.gameName, `Tom & Jerry's "Catan"`);
  });

  it("decodes &amp;, &#039;, and &quot; in description, honors, and ranks", () => {
    const bgg = new BoardGameGeek("1", { config: {} }, {});
    const gameInfo = parseBggDetailsXml(fixture("boardgame-multi-name.xml")).boardgames.boardgame;
    gameInfo.description = "Tom &amp; Jerry&#039;s &quot;House&quot;";
    gameInfo.boardgamehonor[0].text = "Best &amp; Brightest: Kids&#039; Choice &quot;Gold&quot;";
    gameInfo.statistics.ratings.ranks.rank[0].friendlyname = "Kids&#039; Rank";
    bgg.gameInfo = gameInfo;
    bgg.gameName = "Catan";

    bgg.GetGameDescriptionEmbed();
    bgg.GetGameAwardsEmbed();
    bgg.GetGameDetailsEmbed();

    const description = bgg.embeds[0].data.description;
    assert.match(description, /Tom & Jerry's "House"/);
    assert.doesNotMatch(description, /&amp;|&#039;|&quot;/);

    const honors = bgg.embeds[1].data.description;
    assert.equal(honors, "Best & Brightest: Kids' Choice \"Gold\"\n1995 Origins Award\n");

    const ranksField = bgg.embeds[2].data.fields.find((f) => f.name.includes("Ranks"));
    assert.ok(ranksField, "expected Ranks & Ratings field");
    assert.match(ranksField.value, /Kids' Rank/);
    assert.doesNotMatch(ranksField.value, /&amp;|&#039;|&quot;/);
  });

  it("decodes &amp;, &#039;, and &quot; in designer, publisher, and expansion fields", () => {
    const bgg = new BoardGameGeek("126163", { config: {} }, {});
    const gameInfo = parseBggDetailsXml(fixture("boardgame-multi-name.xml")).boardgames.boardgame;
    gameInfo.boardgamedesigner = [
      { text: "Simone Luciani" },
      { text: "Tom &amp; Jerry&#039;s &quot;Designer&quot;" },
    ];
    gameInfo.boardgamepublisher = [
      { text: "Czech Games Edition" },
      { text: "Tom &amp; Jerry&#039;s &quot;Press&quot;" },
    ];
    gameInfo.boardgameexpansion = [
      { text: "Tzolk&#039;in: The Mayan Calendar – Mini Expansion 1", objectid: "134380" },
      { text: "Tom &amp; Jerry&#039;s &quot;Expansion&quot;", objectid: "123" },
    ];
    bgg.gameInfo = gameInfo;
    bgg.gameName = "Tzolk'in: The Mayan Calendar";

    bgg.GetGameDetailsEmbed();

    const fields = bgg.embeds[0].data.fields;
    const designers = fields.find((f) => f.name === "Designer(s)");
    const publishers = fields.find((f) => f.name === "Publisher(s)");
    const expansions = fields.find((f) => f.name === "Expansions");
    assert.ok(designers && publishers && expansions, "expected Designer(s), Publisher(s), and Expansions fields");

    assert.equal(designers.value, "Simone Luciani\nTom & Jerry's \"Designer\"");
    assert.doesNotMatch(designers.value, /&amp;|&#039;|&quot;/);

    assert.equal(publishers.value, "Czech Games Edition\nTom & Jerry's \"Press\"");
    assert.doesNotMatch(publishers.value, /&amp;|&#039;|&quot;/);

    assert.match(expansions.value, /\[Tzolk'in: The Mayan Calendar – Mini Expansion 1\]\(https:\/\/boardgamegeek\.com\/boardgame\/134380\)/);
    assert.match(expansions.value, /\[Tom & Jerry's "Expansion"\]\(https:\/\/boardgamegeek\.com\/boardgame\/123\)/);
    assert.doesNotMatch(expansions.value, /&amp;|&#039;|&quot;/);
  });

  it("decodes HTML entities in single designer, publisher, and expansion values", () => {
    const bgg = new BoardGameGeek("1", { config: {} }, {});
    const gameInfo = parseBggDetailsXml(fixture("boardgame-multi-name.xml")).boardgames.boardgame;
    gameInfo.boardgamedesigner = { text: "Tom &amp; Jerry&#039;s &quot;Designer&quot;" };
    gameInfo.boardgamepublisher = { text: "Kids&#039; Choice &quot;Press&quot;" };
    gameInfo.boardgameexpansion = {
      text: "Tzolk&#039;in: The Mayan Calendar – Mini Expansion 1",
      objectid: "134380",
    };
    bgg.gameInfo = gameInfo;
    bgg.gameName = "Catan";

    bgg.GetGameDetailsEmbed();

    const fields = bgg.embeds[0].data.fields;
    const designers = fields.find((f) => f.name === "Designer(s)");
    const publishers = fields.find((f) => f.name === "Publisher(s)");
    const expansions = fields.find((f) => f.name === "Expansions");

    assert.equal(designers.value, "Tom & Jerry's \"Designer\"");
    assert.equal(publishers.value, "Kids' Choice \"Press\"");
    assert.equal(
      expansions.value,
      "[Tzolk'in: The Mayan Calendar – Mini Expansion 1](https://boardgamegeek.com/boardgame/134380)"
    );
    assert.doesNotMatch(`${designers.value}${publishers.value}${expansions.value}`, /&amp;|&#039;|&quot;/);
  });
});
