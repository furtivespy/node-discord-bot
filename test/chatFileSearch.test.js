import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createChatFileSearch } from "../modules/chatFileSearch.js";

function createFileSearch(getOperation) {
  return createChatFileSearch({
    geminiAI: {
      AI2: {
        operations: {
          get: getOperation,
        },
      },
    },
    wait: async () => {},
  });
}

describe("chatFileSearch finishUpload", () => {
  it("resumes a stored operation name as an SDK Operation with _fromAPIResponse", async () => {
    const seen = [];
    const fileSearch = createFileSearch(async ({ operation }) => {
      seen.push(operation);
      if (typeof operation?._fromAPIResponse !== "function") {
        throw new TypeError("operation._fromAPIResponse is not a function");
      }
      return operation._fromAPIResponse({
        apiResponse: {
          name: operation.name,
          done: true,
          response: { documentName: "fileSearchStores/s/documents/d" },
        },
        _isVertexAI: false,
      });
    });

    const documentName = await fileSearch.finishUpload(
      { channel_id: "1", period_type: "week", period_key: "2026-09-W1" },
      "fileSearchStores/s/operations/abc",
      { setTranscriptUploadOperation() {} }
    );

    assert.equal(typeof seen[0]._fromAPIResponse, "function");
    assert.equal(seen[0].name, "fileSearchStores/s/operations/abc");
    assert.equal(documentName, "fileSearchStores/s/documents/d");
  });
});
