#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import knex from "knex";
import type { Knex } from "knex";
import dotenv from "dotenv";
import { faker } from "@faker-js/faker";
import { format } from "sql-formatter";
import * as fs from "fs/promises";
import * as path from "path";

dotenv.config();

const dbType = (process.env.DB_TYPE || "mysql2") as string;
const safeMode = process.env.SAFE_MODE === "true";

const config: Knex.Config = {
  client: dbType,
  connection: dbType === "sqlite3" 
    ? { filename: process.env.SQLITE_PATH || "./database.sqlite" }
    : {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || (dbType === "pg" ? "5432" : "3306")),
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_DATABASE || "test",
      },
  useNullAsDefault: dbType === "sqlite3",
};

const db = knex(config);

const server = new Server(
  {
    name: "pro-universal-db-mcp",
    version: "3.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_tables",
        description: "List all tables in the database",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "describe_table",
        description: "Get schema/columns for a specific table",
        inputSchema: {
          type: "object",
          properties: { table: { type: "string" } },
          required: ["table"],
        },
      },
      {
        name: "get_relationships",
        description: "Discover foreign key relationships between tables",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "execute_query",
        description: "Execute a raw SQL query (SELECT only in SAFE_MODE)",
        inputSchema: {
          type: "object",
          properties: { sql: { type: "string" } },
          required: ["sql"],
        },
      },
      {
        name: "explain_query",
        description: "Run EXPLAIN on a query to analyze performance",
        inputSchema: {
          type: "object",
          properties: { sql: { type: "string" } },
          required: ["sql"],
        },
      },
      {
        name: "insert_data",
        description: "Insert a row into a table (Disabled in SAFE_MODE)",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string" },
            data: { type: "object" },
          },
          required: ["table", "data"],
        },
      },
      {
        name: "seed_data",
        description: "Seed a table with dummy data using Faker.js (Disabled in SAFE_MODE)",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string" },
            count: { type: "number", default: 10 },
            mapping: { 
              type: "object", 
              description: "Mapping of columns to Faker methods (e.g. { name: 'person.fullName', email: 'internet.email' })" 
            },
          },
          required: ["table", "mapping"],
        },
      },
      {
        name: "update_data",
        description: "Update rows (Disabled in SAFE_MODE)",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string" },
            data: { type: "object" },
            where: { type: "object" },
          },
          required: ["table", "data", "where"],
        },
      },
      {
        name: "delete_data",
        description: "Delete rows (Disabled in SAFE_MODE)",
        inputSchema: {
          type: "object",
          properties: {
            table: { type: "string" },
            where: { type: "object" },
          },
          required: ["table", "where"],
        },
      },
      {
        name: "execute_migration",
        description: "Run CREATE/ALTER/DROP commands (Disabled in SAFE_MODE)",
        inputSchema: {
          type: "object",
          properties: { sql: { type: "string" } },
          required: ["sql"],
        },
      },
      {
        name: "format_sql",
        description: "Pretty-print and format a raw SQL query",
        inputSchema: {
          type: "object",
          properties: { sql: { type: "string" } },
          required: ["sql"],
        },
      },
      {
        name: "export_data",
        description: "Export query results to a file (JSON or CSV)",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string" },
            format: { type: "string", enum: ["json", "csv"], default: "json" },
            filename: { type: "string" }
          },
          required: ["sql", "filename"],
        },
      },
    ],
  };
});

function checkSafeMode(name: string, sql?: string) {
  if (!safeMode) return;

  const destructiveTools = ["insert_data", "update_data", "delete_data", "execute_migration", "seed_data"];
  if (destructiveTools.includes(name)) {
    throw new Error(`Tool '${name}' is disabled in SAFE_MODE.`);
  }

  if (name === "execute_query" && sql) {
    const trimmed = sql.trim().toLowerCase();
    if (!trimmed.startsWith("select") && !trimmed.startsWith("show") && !trimmed.startsWith("describe")) {
      throw new Error("Only read-only queries are allowed in SAFE_MODE.");
    }
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    checkSafeMode(name, (args as any)?.sql);

    switch (name) {
      case "list_tables": {
        let tables;
        if (dbType === "pg") {
          tables = await db("information_schema.tables").where({ table_schema: "public" }).select("table_name");
        } else if (dbType === "sqlite3") {
          tables = await db("sqlite_master").where({ type: "table" }).select("name as table_name");
        } else {
          const [rows] = await db.raw("SHOW TABLES");
          tables = rows;
        }
        return { content: [{ type: "text", text: JSON.stringify(tables, null, 2) }] };
      }

      case "describe_table": {
        const columns = await db(args!.table as string).columnInfo();
        return { content: [{ type: "text", text: JSON.stringify(columns, null, 2) }] };
      }

      case "get_relationships": {
        let rels;
        if (dbType === "mysql2") {
          rels = await db.raw(`
            SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME 
            FROM information_schema.KEY_COLUMN_USAGE 
            WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [process.env.DB_DATABASE]);
          rels = rels[0];
        } else if (dbType === "sqlite3") {
          const tables = await db("sqlite_master").where({ type: "table" }).select("name");
          rels = [];
          for (const t of tables) {
            const fks = await db.raw(`PRAGMA foreign_key_list("${t.name}")`);
            rels.push(...fks.map((f: any) => ({ table: t.name, ...f })));
          }
        } else {
          rels = "Relationship discovery for this DB type is coming soon.";
        }
        return { content: [{ type: "text", text: JSON.stringify(rels, null, 2) }] };
      }

      case "execute_query": {
        const result = await db.raw(args!.sql as string);
        const output = dbType === "mysql2" ? result[0] : (dbType === "pg" ? result.rows : result);
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
      }

      case "explain_query": {
        const result = await db.raw(`EXPLAIN ${args!.sql}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "insert_data": {
        const res = await db(args!.table as string).insert(args!.data as any);
        return { content: [{ type: "text", text: `Inserted ID: ${JSON.stringify(res)}` }] };
      }

      case "seed_data": {
        const { table, count, mapping } = args as any;
        const dummyRows = [];
        for (let i = 0; i < (count || 10); i++) {
          const row: any = {};
          for (const [col, fakerPath] of Object.entries(mapping)) {
            const [namespace, method] = (fakerPath as string).split(".");
            try {
              const fn = (faker as any)[namespace!][method!];
              if (typeof fn === "function") {
                row[col] = fn();
              }
            } catch (e) {
              console.error(`Faker failed for ${fakerPath}`);
            }
          }
          dummyRows.push(row);
        }
        await db(table).insert(dummyRows);
        return { content: [{ type: "text", text: `Successfully seeded ${count} rows into ${table}` }] };
      }

      case "update_data": {
        const count = await db(args!.table as string).where(args!.where as any).update(args!.data as any);
        return { content: [{ type: "text", text: `Updated ${count} rows.` }] };
      }

      case "delete_data": {
        const count = await db(args!.table as string).where(args!.where as any).del();
        return { content: [{ type: "text", text: `Deleted ${count} rows.` }] };
      }

      case "execute_migration": {
        await db.raw(args!.sql as string);
        return { content: [{ type: "text", text: "Migration executed successfully." }] };
      }

      case "format_sql": {
        const formatted = format(args!.sql as string, { language: "mysql" });
        return { content: [{ type: "text", text: formatted }] };
      }

      case "export_data": {
        const { sql, format: fmt, filename } = args as any;
        const result = await db.raw(sql);
        const data = dbType === "mysql2" ? result[0] : (dbType === "pg" ? result.rows : result);
        let content = "";
        if (fmt === "json") {
          content = JSON.stringify(data, null, 2);
        } else {
          const headers = Object.keys(data[0] || {}).join(",");
          const rows = data.map((r: any) => Object.values(r).join(",")).join("\n");
          content = `${headers}\n${rows}`;
        }
        await fs.writeFile(filename, content);
        return { content: [{ type: "text", text: `Data exported to ${path.resolve(filename)}` }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Pro Universal DB MCP server (${dbType}) running on stdio`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
