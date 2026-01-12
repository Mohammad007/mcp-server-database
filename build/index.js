import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import knex from "knex";
import dotenv from "dotenv";
dotenv.config();
const dbType = (process.env.DB_TYPE || "mysql2");
const config = {
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
const server = new Server({
    name: "universal-db-mcp-server",
    version: "2.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
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
                    properties: {
                        table: { type: "string" },
                    },
                    required: ["table"],
                },
            },
            {
                name: "execute_query",
                description: "Execute a raw SQL query",
                inputSchema: {
                    type: "object",
                    properties: {
                        sql: { type: "string" },
                    },
                    required: ["sql"],
                },
            },
            {
                name: "insert_data",
                description: "Insert a row into a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        table: { type: "string" },
                        data: { type: "object", description: "Column-value pairs" },
                    },
                    required: ["table", "data"],
                },
            },
            {
                name: "update_data",
                description: "Update rows in a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        table: { type: "string" },
                        data: { type: "object", description: "Column-value pairs to update" },
                        where: { type: "object", description: "Condition for update" },
                    },
                    required: ["table", "data", "where"],
                },
            },
            {
                name: "delete_data",
                description: "Delete rows from a table",
                inputSchema: {
                    type: "object",
                    properties: {
                        table: { type: "string" },
                        where: { type: "object", description: "Condition for deletion" },
                    },
                    required: ["table", "where"],
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "list_tables": {
                let tables;
                if (dbType === "pg") {
                    tables = await db("information_schema.tables")
                        .where({ table_schema: "public" })
                        .select("table_name");
                }
                else if (dbType === "sqlite3") {
                    tables = await db("sqlite_master")
                        .where({ type: "table" })
                        .select("name as table_name");
                }
                else {
                    // MySQL
                    const [rows] = await db.raw("SHOW TABLES");
                    tables = rows;
                }
                return { content: [{ type: "text", text: JSON.stringify(tables, null, 2) }] };
            }
            case "describe_table": {
                const table = args?.table;
                const columns = await db(table).columnInfo();
                return { content: [{ type: "text", text: JSON.stringify(columns, null, 2) }] };
            }
            case "execute_query": {
                const sql = args?.sql;
                const result = await db.raw(sql);
                // Knex raw returns different formats based on dialect
                const output = dbType === "mysql2" ? result[0] : (dbType === "pg" ? result.rows : result);
                return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
            }
            case "insert_data": {
                const { table, data } = args;
                const result = await db(table).insert(data);
                return { content: [{ type: "text", text: `Inserted: ${JSON.stringify(result)}` }] };
            }
            case "update_data": {
                const { table, data, where } = args;
                const count = await db(table).where(where).update(data);
                return { content: [{ type: "text", text: `Updated ${count} rows.` }] };
            }
            case "delete_data": {
                const { table, where } = args;
                const count = await db(table).where(where).del();
                return { content: [{ type: "text", text: `Deleted ${count} rows.` }] };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${dbType} MCP server running on stdio`);
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map