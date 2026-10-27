import { describe, expect, it } from "vitest";
import { configSnippets } from "./snippets";

const connection = {
  url: "http://127.0.0.1:41736/mcp",
  token: "f00d",
  command: "C:\\Program Files\\Carbonara\\carbonara.exe",
};

describe("the copy-config snippets", () => {
  it("add the HTTP server to Claude Code with the token", () => {
    expect(configSnippets(connection)[0]).toEqual({
      client: "Claude Code",
      where: "Run in a terminal",
      text: 'claude mcp add --transport http carbonara http://127.0.0.1:41736/mcp --header "Authorization: Bearer f00d"',
    });
  });

  it("launch the stdio bridge from Claude Desktop, with the path quoted as JSON", () => {
    const desktop = configSnippets(connection).find(({ client }) => client === "Claude Desktop");
    expect(JSON.parse(desktop?.text ?? "")).toEqual({
      mcpServers: { carbonara: { command: connection.command, args: ["mcp"] } },
    });
  });

  it("give other clients the URL and the authorization header", () => {
    const other = configSnippets(connection).at(-1);
    expect(JSON.parse(other?.text ?? "")).toEqual({
      mcpServers: {
        carbonara: { type: "http", url: connection.url, headers: { Authorization: "Bearer f00d" } },
      },
    });
  });
});
