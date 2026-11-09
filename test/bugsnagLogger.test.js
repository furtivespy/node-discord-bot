import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import Bugsnag from "@bugsnag/js";
import createBugsnagLogger from "../modules/bugsnagLogger.js";

const require = createRequire(import.meta.url);
const API_KEY = "0123456789abcdef0123456789abcdef";
const TEST_MESSAGE = "FUR-148 bugsnagLogger notify test";
const STRING_MESSAGE = "FUR-148 string log error";
const DEFAULT_NOTIFY = "https://notify.bugsnag.com";
const DEFAULT_SESSIONS = "https://sessions.bugsnag.com";

function silentLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function startCaptureServer() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("error", () => {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    });
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

function interceptBugsnagHttps(localUrl) {
  const local = new URL(localUrl);
  const origHttpsRequest = https.request;

  function rewrite(options) {
    if (!options || typeof options === "string" || options instanceof URL) return null;
    const hostname = options.hostname || options.host;
    if (hostname !== "notify.bugsnag.com" && hostname !== "sessions.bugsnag.com") {
      return null;
    }
    return {
      ...options,
      protocol: "http:",
      hostname: local.hostname,
      host: `${local.hostname}:${local.port}`,
      port: local.port,
      defaultPort: Number(local.port),
      servername: undefined,
      agent: undefined,
    };
  }

  https.request = function patchedHttpsRequest(options, ...rest) {
    const rewritten = rewrite(options);
    if (rewritten) return http.request(rewritten, ...rest);
    return origHttpsRequest.call(this, options, ...rest);
  };

  return () => {
    https.request = origHttpsRequest;
  };
}

describe("@bugsnag/js 9.1.0 + bugsnagLogger", () => {
  let capture;
  let logger;
  let startOpts;
  let origStart;
  let restoreHttps;
  let sendCount = 0;

  before(async () => {
    capture = await startCaptureServer();
    restoreHttps = interceptBugsnagHttps(capture.url);
    origStart = Bugsnag.start;
    Bugsnag.start = (opts) => {
      startOpts = { ...opts };
      return origStart.call(Bugsnag, {
        ...opts,
        autoTrackSessions: false,
        autoDetectErrors: false,
        logger: silentLogger(),
      });
    };
    logger = createBugsnagLogger(API_KEY, "test");
    const origSendEvent = logger.bugsnagClient._delivery.sendEvent.bind(logger.bugsnagClient._delivery);
    logger.bugsnagClient._delivery.sendEvent = (event, cb) => {
      sendCount += 1;
      return origSendEvent(event, cb);
    };
  });

  after(() => {
    restoreHttps();
    Bugsnag.start = origStart;
    Bugsnag._client = null;
    if (typeof capture.server.closeAllConnections === "function") {
      capture.server.closeAllConnections();
    }
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

  it("calls Bugsnag.start with apiKey and releaseStage and keeps default endpoints", () => {
    assert.equal(startOpts.apiKey, API_KEY);
    assert.equal(startOpts.releaseStage, "test");
    assert.equal("endpoints" in startOpts, false);
    assert.equal(Bugsnag.isStarted(), true);
    assert.equal(logger.bugsnagClient._config.endpoints.notify, DEFAULT_NOTIFY);
    assert.equal(logger.bugsnagClient._config.endpoints.sessions, DEFAULT_SESSIONS);
  });

  it("delivers logger.error through notify to the default Bugsnag endpoint", async () => {
    const before = capture.received.length;
    const sendsBefore = sendCount;
    logger.error(new Error(TEST_MESSAGE));
    await waitUntil(() => capture.received.length > before && sendCount > sendsBefore);

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

  it("delivers logger.log(string, error) through notify", async () => {
    const before = capture.received.length;
    logger.log(STRING_MESSAGE, "error");
    await waitUntil(() => capture.received.length > before);
    const payload = JSON.parse(capture.received.at(-1).body);
    assert.equal(payload.events[0].exceptions[0].message, STRING_MESSAGE);
  });

  it("does not notify Bugsnag for warn, debug, cmd, or default log", () => {
    const before = sendCount;
    logger.warn("not an error");
    logger.debug("not an error");
    logger.cmd("not an error");
    logger.log("not an error");
    assert.equal(sendCount, before);
  });
});
