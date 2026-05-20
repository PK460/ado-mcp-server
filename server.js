require("dotenv").config();
const axios = require("axios");

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const ORG = process.env.ADO_ORG;
const PROJECT = process.env.ADO_PROJECT;
const PAT = process.env.ADO_PAT;

if (!PAT) {
  throw new Error("Environment variable ADO_PAT is required.");
}

const auth = Buffer.from(`:${PAT}`).toString("base64");

const server = new McpServer({
  name: "ado-server",
  version: "1.0.0",
});

server.tool(
  "create_task",
  {
    title: "string",
    description: "string",
  },
  async ({ title, description }) => {
    try {
      const response = await axios.post(
        `https://dev.azure.com/${ORG}/${PROJECT}/_apis/wit/workitems/$Task?api-version=7.1`,
        [
          {
            op: "add",
            path: "/fields/System.Title",
            value: title,
          },
          {
            op: "add",
            path: "/fields/System.Description",
            value: description || "",
          },
        ],
        {
          headers: {
            "Content-Type": "application/json-patch+json",
            Authorization: `Basic ${auth}`,
          },
        }
      );

      return {
        content: [
          {
            type: "text",
            text: `Task created successfully: ${response.data.id}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: err.message,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("ADO MCP Server running...");
}

main().catch(console.error);