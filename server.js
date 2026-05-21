require("dotenv").config();

const axios = require("axios");

const {
  Server,
} = require("@modelcontextprotocol/sdk/server/index.js");

const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");

const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

/* =========================================================
   ENV VARIABLES
========================================================= */

const ORG = process.env.ADO_ORG;
const PROJECT = process.env.ADO_PROJECT;
const PAT = process.env.ADO_PAT;

if (!ORG || !PROJECT || !PAT) {
  console.error("Missing environment variables");
  console.error("Required:");
  console.error("ADO_ORG");
  console.error("ADO_PROJECT");
  console.error("ADO_PAT");
  process.exit(1);
}

const auth = Buffer.from(`:${PAT}`).toString("base64");

/* =========================================================
   MCP SERVER
========================================================= */

const server = new Server(
  {
    name: "ado-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/* =========================================================
   LIST TOOLS
========================================================= */

server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("TOOLS LIST REQUESTED");

  return {
    tools: [
      {
        name: "create_task",
        description: "Create Azure DevOps Task",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Task title",
            },
            description: {
              type: "string",
              description: "Task description",
            },
          },
          required: ["title"],
        },
      },
    ],
  };
});

/* =========================================================
   CALL TOOL
========================================================= */

server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    try {
      console.error("=================================");
      console.error("TOOL REQUEST RECEIVED");
      console.error(JSON.stringify(request, null, 2));
      console.error("=================================");

      const { name, arguments: args } = request.params;

      if (name !== "create_task") {
        throw new Error(`Unknown tool: ${name}`);
      }

      const title = args.title;
      const description = args.description || "";

      console.error("Creating Azure DevOps Task...");
      console.error("Title:", title);
      console.error("Description:", description);

      const url = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/wit/workitems/$Task?api-version=7.1`;

      console.error("API URL:", url);

      const response = await axios.post(
        url,
        [
          {
            op: "add",
            path: "/fields/System.Title",
            value: title,
          },
          {
            op: "add",
            path: "/fields/System.Description",
            value: description,
          },
        ],
        {
          headers: {
            "Content-Type": "application/json-patch+json",
            Authorization: `Basic ${auth}`,
          },
        }
      );

      console.error("TASK CREATED SUCCESSFULLY");
      console.error("Task ID:", response.data.id);

      return {
        content: [
          {
            type: "text",
            text: `Task created successfully with ID ${response.data.id}`,
          },
        ],
      };
    } catch (err) {
      console.error("=================================");
      console.error("ERROR CREATING TASK");
      console.error("=================================");

      if (err.response) {
        console.error(JSON.stringify(err.response.data, null, 2));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(err.response.data, null, 2),
            },
          ],
        };
      }

      console.error(err.message);

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

/* =========================================================
   MAIN
========================================================= */

async function main() {
  try {
    const transport = new StdioServerTransport();

    await server.connect(transport);

    console.error("=================================");
    console.error("ADO MCP SERVER RUNNING");
    console.error("Organization:", ORG);
    console.error("Project:", PROJECT);
    console.error("=================================");
  } catch (err) {
    console.error("SERVER FAILED TO START");
    console.error(err);
  }
}

/* =========================================================
   DIRECT TEST
========================================================= */

async function testCreateTask() {
  try {
    const url = `https://dev.azure.com/${ORG}/${PROJECT}/_apis/wit/workitems/$Task?api-version=7.1`;

    const response = await axios.post(
      url,
      [
        {
          op: "add",
          path: "/fields/System.Title",
          value: "Test Task From Terminal",
        },
        {
          op: "add",
          path: "/fields/System.Description",
          value: "Created using Node.js MCP server",
        },
      ],
      {
        headers: {
          "Content-Type": "application/json-patch+json",
          Authorization: `Basic ${auth}`,
        },
      }
    );

    console.log("TASK CREATED SUCCESSFULLY");
    console.log("Task ID:", response.data.id);
  } catch (err) {
    console.log("ERROR");

    if (err.response) {
      console.log(err.response.data);
    } else {
      console.log(err.message);
    }
  }
}

testCreateTask();

main();