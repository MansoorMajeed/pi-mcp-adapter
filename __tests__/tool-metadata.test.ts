import { describe, expect, it } from "vitest";
import { formatSchema, buildToolMetadata } from "../tool-metadata.ts";
import { reconstructToolMetadata, type ServerCacheEntry } from "../metadata-cache.ts";
import type { McpTool, ServerEntry } from "../types.ts";

describe("formatSchema", () => {
  it("keeps simple object schemas compact", () => {
    const schema = {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term", default: "all" },
        limit: { type: ["number", "null"] },
        mode: { enum: ["fast", "safe"] },
      },
      required: ["query"],
    };

    expect(formatSchema(schema)).toBe([
      "  query (string) *required* - Search term [default: \"all\"]",
      "  limit (number | null)",
      "  mode (enum: \"fast\", \"safe\")",
    ].join("\n"));
  });

  it("expands union branches with const discriminator fields", () => {
    const schema = {
      type: "object",
      properties: {
        document: {
          anyOf: [
            {
              type: "object",
              properties: {
                type: { const: "text" },
                content: { type: "string", minLength: 1 },
              },
              required: ["type", "content"],
            },
            {
              type: "object",
              properties: {
                type: { const: "file" },
                path: { type: "string", minLength: 1 },
              },
              required: ["type", "path"],
            },
          ],
        },
      },
      required: ["document"],
    };

    expect(formatSchema(schema)).toBe([
      "  document *required*",
      "    anyOf:",
      "      - object",
      "        type (const \"text\") *required*",
      "        content (string) *required* [minLength: 1]",
      "      - object",
      "        type (const \"file\") *required*",
      "        path (string) *required* [minLength: 1]",
    ].join("\n"));
  });

  it("formats oneOf branches", () => {
    const schema = {
      type: "object",
      properties: {
        target: {
          oneOf: [
            { const: "draft" },
            { const: "published" },
          ],
        },
      },
    };

    expect(formatSchema(schema)).toBe([
      "  target",
      "    oneOf:",
      "      - const \"draft\"",
      "      - const \"published\"",
    ].join("\n"));
  });

  it("formats nested object properties and array items", () => {
    const schema = {
      type: "object",
      properties: {
        config: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            tags: {
              type: "array",
              items: { enum: ["alpha", "beta"] },
              minItems: 1,
            },
          },
          required: ["enabled"],
        },
      },
      required: ["config"],
    };

    expect(formatSchema(schema)).toBe([
      "  config (object) *required*",
      "    enabled (boolean) *required*",
      "    tags (array) [minItems: 1]",
      "      items (enum: \"alpha\", \"beta\")",
    ].join("\n"));
  });
});

const uiTool: McpTool = {
  name: "search_kb",
  description: "Search the knowledge base",
  inputSchema: { type: "object", properties: {} },
  _meta: { ui: { resourceUri: "ui://search/app.html" } },
};

describe("buildToolMetadata UI gating", () => {
  const build = (definition: ServerEntry) =>
    buildToolMetadata([uiTool], [], definition, "search", "none").metadata;

  it("populates uiResourceUri by default", () => {
    const metadata = build({});
    expect(metadata).toHaveLength(1);
    expect(metadata[0].uiResourceUri).toBe("ui://search/app.html");
  });

  it("keeps UI when apps is explicitly true", () => {
    expect(build({ apps: true })[0].uiResourceUri).toBe("ui://search/app.html");
  });

  it("strips uiResourceUri when apps is false but keeps the tool", () => {
    const metadata = build({ apps: false });
    expect(metadata).toHaveLength(1);
    expect(metadata[0].name).toBe("search_kb");
    expect(metadata[0].uiResourceUri).toBeUndefined();
  });
});

describe("reconstructToolMetadata UI gating", () => {
  const cacheEntry: ServerCacheEntry = {
    configHash: "test",
    tools: [{
      name: "search_kb",
      description: "Search the knowledge base",
      inputSchema: { type: "object", properties: {} },
      uiResourceUri: "ui://search/app.html",
    }],
    resources: [],
    cachedAt: Date.now(),
  };
  const reconstruct = (definition: Partial<ServerEntry>) =>
    reconstructToolMetadata("search", cacheEntry, "none", definition);

  it("populates uiResourceUri by default", () => {
    const metadata = reconstruct({});
    expect(metadata).toHaveLength(1);
    expect(metadata[0].uiResourceUri).toBe("ui://search/app.html");
  });

  it("strips uiResourceUri when apps is false but keeps the tool", () => {
    const metadata = reconstruct({ apps: false });
    expect(metadata).toHaveLength(1);
    expect(metadata[0].name).toBe("search_kb");
    expect(metadata[0].uiResourceUri).toBeUndefined();
  });
});
