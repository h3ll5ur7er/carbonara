// "Copy config" snippets that connect common MCP clients to the desktop app's server.

/** Where the desktop app's MCP server is; the shell passes it to `attachMcpShell`. */
export interface McpConnectionInfo {
  /** The Streamable HTTP endpoint. */
  url: string;
  token: string;
  /** The app's executable: `<command> mcp` runs the stdio bridge. */
  command: string;
}

export interface ConfigSnippet {
  client: string;
  /** Where the snippet goes. */
  where: string;
  text: string;
}

export function configSnippets({ url, token, command }: McpConnectionInfo): ConfigSnippet[] {
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return [
    {
      client: "Claude Code",
      where: "Run in a terminal",
      text: `claude mcp add --transport http carbonara ${url} --header "Authorization: Bearer ${token}"`,
    },
    {
      client: "Claude Desktop",
      where: "claude_desktop_config.json",
      text: json({ mcpServers: { carbonara: { command, args: ["mcp"] } } }),
    },
    {
      client: "Other clients",
      where: "The client's MCP server settings",
      text: json({ mcpServers: { carbonara: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }),
    },
  ];
}
