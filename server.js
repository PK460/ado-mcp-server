const axios = require("axios");

const {
  Server
} = require("@modelcontextprotocol/sdk/server/index.js");

const {
  StdioServerTransport
} = require("@modelcontextprotocol/sdk/server/stdio.js");

const {
  ListToolsRequestSchema,
  CallToolRequestSchema
} = require("@modelcontextprotocol/sdk/types.js");

const ORG = "PujaKumari0636";
const PROJECT = "Liberchat";
const PAT = process.env.ADO_PAT;

if (!PAT) {
  throw new Error("Environment variable ADO_PAT is required.");
}

const auth = Buffer.from(`:${PAT}`).toString("base64");

const server = new Server(
  { name: "ado-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

//
// ✅ FIX 1: tools/list MUST use schema
//
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_task",
        description: "Create Azure DevOps Task",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          },
          required: ["title"]
        }
      }
    ]
  };
});

//
// ✅ FIX 2: tools/call MUST use schema
//
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "create_task") {
    const response = await axios.post(
      `https://dev.azure.com/${ORG}/${PROJECT}/_apis/wit/workitems/$Task?api-version=7.1`,
      [
        { op: "add", path: "/fields/System.Title", value: args.title },
        { op: "add", path: "/fields/System.Description", value: args.description }
      ],
      {
        headers: {
          "Content-Type": "application/json-patch+json",
          Authorization: `Basic ${auth}`
        }
      }
    );

    return {
      content: [
        {
          type: "text",
          text: `Task created successfully: ${response.data.id}`
        }
      ]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("ADO MCP Server running...");
}

main().catch(console.error);