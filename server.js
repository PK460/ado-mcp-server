require("dotenv").config();

const axios = require("axios");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

/* =========================================================
   ENV
========================================================= */

const ORG = process.env.ADO_ORG;
const PROJECT = process.env.ADO_PROJECT;
const PAT = process.env.ADO_PAT;

if (!ORG || !PROJECT || !PAT) {
  console.error("Missing env variables");
  process.exit(1);
}

const auth = Buffer.from(`:${PAT}`).toString("base64");

const BASE_URL = `https://dev.azure.com/${ORG}/${PROJECT}`;

/* =========================================================
   TYPES
========================================================= */

const EPIC_TYPE = "Epic";
const ISSUE_TYPE = "Issue";
const TASK_TYPE = "Task";

/* =========================================================
   SAFE PATHS (IMPORTANT)
========================================================= */

const AREA_PATH = `${PROJECT}`;
const ITERATION_PATH = `${PROJECT}`;

/* =========================================================
   CREATE WORK ITEM
========================================================= */

async function createWorkItem(type, title, description = "", parentId = null) {
  const url = `${BASE_URL}/_apis/wit/workitems/$${type}?api-version=7.1`;

  const body = [
    { op: "add", path: "/fields/System.Title", value: title },
    { op: "add", path: "/fields/System.Description", value: description },
    { op: "add", path: "/fields/System.AreaPath", value: AREA_PATH },
    { op: "add", path: "/fields/System.IterationPath", value: ITERATION_PATH },
  ];

  if (parentId) {
    body.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${BASE_URL}/_apis/wit/workItems/${parentId}`,
        attributes: { comment: "Hierarchy link" },
      },
    });
  }

  const res = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/json-patch+json",
      Authorization: `Basic ${auth}`,
    },
  });

  return res.data;
}

/* =========================================================
   MCP SERVER
========================================================= */

const server = new Server(
  {
    name: "ado-backlog-server",
    version: "10.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

/* =========================================================
   TOOL
========================================================= */

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_backlog",
        description: "Creates Epic → Issue → Task (with fallback support)",
        inputSchema: {
          type: "object",
          properties: {
            epic_title: { type: "string" },
            epic_description: { type: "string" },

            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["title"],
                    },
                  },
                },
                required: ["title"],
              },
            },
          },
          required: ["epic_title", "issues"],
        },
      },
    ],
  };
});

/* =========================================================
   SAFE CREATE WITH FALLBACK
========================================================= */

async function safeCreate(type, title, description, parentId) {
  try {
    return await createWorkItem(type, title, description, parentId);
  } catch (err) {
    console.log(`⚠️ Failed to create ${type}, skipping...`);
    console.log(err.response?.data || err.message);
    return null;
  }
}

/* =========================================================
   MAIN LOGIC
========================================================= */

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "create_backlog") throw new Error("Unknown tool");

  const log = [];

  /* ================= EPIC ================= */
  const epic = await safeCreate(
    EPIC_TYPE,
    args.epic_title,
    args.epic_description || ""
  );

  if (epic) log.push(`Epic → ${epic.id}`);

  /* ================= ISSUES ================= */
  for (const issue of args.issues) {
    const createdIssue = await safeCreate(
      ISSUE_TYPE,
      issue.title,
      issue.description || "",
      epic?.id
    );

    if (!createdIssue) continue;

    log.push(`Issue → ${createdIssue.id}`);

    /* ================= TASKS ================= */
    if (issue.tasks) {
      for (const task of issue.tasks) {
        const createdTask = await safeCreate(
          TASK_TYPE,
          task.title,
          task.description || "",
          createdIssue.id
        );

        if (createdTask) {
          log.push(`Task → ${createdTask.id}`);
        }
      }
    }
  }

  return {
    content: [
      {
        type: "text",
        text:
          "BACKLOG CREATED (EPIC → ISSUE → TASK with fallback)\n\n" +
          log.join("\n"),
      },
    ],
  };
});

/* =========================================================
   START
========================================================= */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ADO SERVER RUNNING (EPIC → ISSUE → TASK SAFE MODE)");
}

main();