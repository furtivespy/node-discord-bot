import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import Bugsnag from "@bugsnag/js";
import createBugsnagLogger from "../modules/bugsnagLogger.js";

const require = createRequire(import.meta.url);
const API_KEY = "0123456789abcdef0123456789abcdef";
const TEST_MESSAGE = "FUR-148 bugsnagLogger notify test";

function silentLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function startCaptureServer() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        received,
        url: `http://127.0.0.1:${port}`,
      });
    });
  });
}

function waitUntil(predicate, timeoutMs = 2000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("timed out waiting for Bugsnag notify payload"));
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe("@bugsnag/js 9.1.0 + bugsnagLogger", () => {
  let capture;
  let logger;
  let startOpts;
  let origStart;

  before(async () => {
    capture = await startCaptureServer();
    origStart = Bugsnag.start;
    Bugsnag.start = (opts) => {
      startOpts = { ...opts };
      return origStart.call(Bugsnag, {
        ...opts,
        endpoints: {
          notify: capture.url,
          sessions: `${capture.url}/sessions`,
        },
        autoTrackSessions: false,
        autoDetectErrors: false,
        logger: silentLogger(),
      });
    };
    logger = createBugsnagLogger(API_KEY, "test");
  });

  after(() => {
    Bugsnag.start = origStart;
    return new Promise((resolve, reject) => {
      capture.server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("installs @bugsnag/js 9.1.0 with start/notify on the default export", () => {
    assert.equal(require("@bugsnag/js/package.json").version, "9.1.0");
    assert.equal(typeof Bugsnag.start, "function");
    assert.equal(typeof Bugsnag.notify, "function");
    assert.equal(typeof logger.bugsnagClient.notify, "function");
  });

  it("calls Bugsnag.start with apiKey and releaseStage", () => {
    assert.equal(startOpts.apiKey, API_KEY);
    assert.equal(startOpts.releaseStage, "test");
    assert.equal(Bugsnag.isStarted(), true);
  });

  it("delivers logger.error through notify to the Bugsnag endpoint", async () => {
    const before = capture.received.length;
    logger.error(new Error(TEST_MESSAGE));
    await waitUntil(() => capture.received.length > before);

    const req = capture.received.at(-1);
    assert.equal(req.method, "POST");
    assert.equal(req.headers["bugsnag-api-key"], API_KEY);
    assert.equal(req.headers["bugsnag-payload-version"], "4");
    assert.match(req.headers["content-type"], /application\/json/);

    const payload = JSON.parse(req.body);
    assert.equal(payload.apiKey, API_KEY);
    assert.equal(payload.events[0].app.releaseStage, "test");
    assert.equal(payload.events[0].exceptions[0].message, TEST_MESSAGE);
    assert.equal(payload.events[0].exceptions[0].errorClass, "Error");
  });

  it("does not notify Bugsnag for warn, debug, cmd, or default log", async () => {
    const before = capture.received.length;
    logger.warn("not an error");
    logger.debug("not an error");
    logger.cmd("not an error");
    logger.log("not an error");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(capture.received.length, before);
  });
});
