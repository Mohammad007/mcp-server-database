# Pro Universal SQL MCP Server

A professional-grade **Model Context Protocol (MCP)** server for interacting with **MySQL**, **Postgres**, and **SQLite**. This server goes beyond basic read/write, offering advanced features for schema analysis, dummy data generation, and performance optimization.

## 🚀 New Pro Features

1.  **Smart Schema Discovery**: Automatically discovers Foreign Key relationships so AI can write complex JOIN queries without being told.
2.  **Smart Seeding (Faker.js)**: Generate hundreds of realistic dummy records (names, emails, dates) in seconds.
3.  **Performance Optimization**: `EXPLAIN` query analyzer to help AI suggest better indexes.
4.  **Data Export**: Export any query results directly to **CSV** or **JSON** files.
5.  **Schema Migrations**: Safely execute `CREATE`, `ALTER`, and `DROP` commands via AI.
6.  **SQL Formatter**: Pretty-print raw SQL queries for better readability.
7.  **Safe Mode (Security)**: A toggle to restrict AI to Read-Only operations on production databases.

## 🛠️ Installation

1.  **Clone & Install**:
    ```bash
    git clone <repo-url>
    npm install
    ```
2.  **Configure `.env`**:
    ```env
    DB_TYPE=mysql2  # Options: mysql2, pg, sqlite3
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=your_password
    DB_DATABASE=test
    SAFE_MODE=false # Set true for Read-Only mode
    ```
3.  **Build**:
    ```bash
    npm run build
    ```

## 🔌 Cursor / mcp.json Configuration

Update your global `mcp.json` file:

```json
{
  "mcpServers": {
    "pro-universal-db": {
      "command": "node",
      "args": ["D:/App/db_mcp/build/index.js"],
      "env": {
        "DB_TYPE": "mysql2",
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "root",
        "DB_PASSWORD": "",
        "DB_DATABASE": "test",
        "SAFE_MODE": "false"
      }
    }
  }
}
```

## 💬 Powerful New Prompts

- **Smart Joins**: "Show me all orders made by John Doe" (AI will use relationship discovery).
- **Seeding**: "Seed my `users` table with 50 dummy records using `person.fullName` and `internet.email`."
- **Analysis**: "Explain why this query is slow and suggest an index."
- **Exporting**: "Export all orders from last week to a file named `report.csv`."
- **Migrations**: "Add a `profile_picture` column to the `users` table."
- **Format**: "Format this messy SQL query: `SELECT * FROM users WHERE id=1`."

## 🛡️ Security (Safe Mode)

Set `SAFE_MODE=true` in your `.env` or `mcp.json` to disable all destructive operations (`INSERT`, `UPDATE`, `DELETE`, `MIGRATION`, `SEEDING`). This is highly recommended for production environments.
