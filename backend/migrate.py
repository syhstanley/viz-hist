"""
Migration script: old schema → new schema.

Reads from data/viz-hist.db (old), creates data/viz-hist-new.db (new),
migrates all data, then swaps.

Run: uv run python migrate.py
"""
import json
import os
import sqlite3
import shutil

OLD_DB = "./data/viz-hist.db"
NEW_DB = "./data/viz-hist-new.db"
BACKUP_DB = "./data/viz-hist-backup.db"

COLORS = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
    "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
]


def migrate():
    if not os.path.exists(OLD_DB):
        print("No old database found, nothing to migrate.")
        return

    # Remove new db if exists from previous failed migration
    if os.path.exists(NEW_DB):
        os.remove(NEW_DB)

    old_conn = sqlite3.connect(OLD_DB)
    old_conn.row_factory = sqlite3.Row
    new_conn = sqlite3.connect(NEW_DB)

    # Create new schema
    new_conn.executescript("""
        CREATE TABLE projects (
            id INTEGER NOT NULL PRIMARY KEY,
            name VARCHAR NOT NULL,
            created_at DATETIME,
            updated_at DATETIME
        );
        CREATE TABLE data_versions (
            id INTEGER NOT NULL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            label VARCHAR NOT NULL,
            file_path VARCHAR NOT NULL,
            original_filename VARCHAR NOT NULL DEFAULT '',
            schema_def JSON,
            row_count INTEGER,
            file_size INTEGER,
            created_at DATETIME,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX ix_data_versions_project_id ON data_versions(project_id);
        CREATE TABLE plot_configs (
            id INTEGER NOT NULL PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name VARCHAR NOT NULL DEFAULT 'Default',
            x_column VARCHAR,
            color_column VARCHAR,
            tooltip_columns JSON,
            is_default BOOLEAN DEFAULT 1,
            created_at DATETIME,
            updated_at DATETIME,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        CREATE INDEX ix_plot_configs_project_id ON plot_configs(project_id);
        CREATE TABLE plot_lines (
            id INTEGER NOT NULL PRIMARY KEY,
            plot_config_id INTEGER NOT NULL,
            version_id INTEGER,
            y_column VARCHAR NOT NULL,
            color VARCHAR NOT NULL DEFAULT '#3b82f6',
            enabled BOOLEAN DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY(plot_config_id) REFERENCES plot_configs(id) ON DELETE CASCADE,
            FOREIGN KEY(version_id) REFERENCES data_versions(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_plot_lines_plot_config_id ON plot_lines(plot_config_id);
        CREATE INDEX ix_plot_lines_version_id ON plot_lines(version_id);
    """)

    # Migrate projects
    for row in old_conn.execute("SELECT * FROM projects"):
        chart_config = json.loads(row["chart_config"]) if row["chart_config"] else None
        schema_def = json.loads(row["schema_def"]) if row["schema_def"] else None

        new_conn.execute(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (row["id"], row["name"], row["created_at"], row["created_at"]),
        )

        # Migrate versions
        versions = list(old_conn.execute(
            "SELECT * FROM data_versions WHERE project_id = ?", (row["id"],)
        ))
        for v in versions:
            # Extract original filename
            path_parts = v["file_path"].split("/")
            stored_name = path_parts[-1] if path_parts else ""
            import re
            original_filename = re.sub(r"^\d{14}_", "", stored_name)

            # Get file size
            file_size = None
            if os.path.exists(v["file_path"]):
                file_size = os.path.getsize(v["file_path"])

            # Get row count from CSV
            row_count = None
            if os.path.exists(v["file_path"]):
                try:
                    with open(v["file_path"]) as f:
                        row_count = sum(1 for _ in f) - 1  # subtract header
                except Exception:
                    pass

            new_conn.execute(
                """INSERT INTO data_versions
                (id, project_id, label, file_path, original_filename, schema_def, row_count, file_size, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    v["id"], v["project_id"], v["label"], v["file_path"],
                    original_filename,
                    json.dumps(schema_def) if schema_def else None,
                    row_count, file_size,
                    v["created_at"],
                ),
            )

        # Migrate chart_config → plot_config + plot_lines
        if chart_config:
            new_conn.execute(
                """INSERT INTO plot_configs
                (project_id, name, x_column, color_column, tooltip_columns, is_default, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    row["id"],
                    "Default",
                    chart_config.get("x_column"),
                    chart_config.get("color_column"),
                    json.dumps(chart_config.get("tooltip_columns")) if chart_config.get("tooltip_columns") is not None else None,
                    1,
                    row["created_at"],
                    row["created_at"],
                ),
            )
            config_id = new_conn.execute("SELECT last_insert_rowid()").fetchone()[0]

            # Migrate plot_lines from chart_config
            saved_lines = chart_config.get("plot_lines", [])
            if saved_lines:
                for i, pl in enumerate(saved_lines):
                    new_conn.execute(
                        """INSERT INTO plot_lines
                        (plot_config_id, version_id, y_column, color, enabled, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?)""",
                        (
                            config_id,
                            pl.get("version_id"),
                            pl.get("y_column", ""),
                            pl.get("color", COLORS[i % len(COLORS)]),
                            1 if pl.get("enabled", True) else 0,
                            i,
                        ),
                    )
            elif chart_config.get("y_columns"):
                # Fallback: create lines from y_columns × versions
                y_cols = chart_config["y_columns"]
                idx = 0
                for v in versions:
                    for yc in y_cols:
                        new_conn.execute(
                            """INSERT INTO plot_lines
                            (plot_config_id, version_id, y_column, color, enabled, sort_order)
                            VALUES (?, ?, ?, ?, ?, ?)""",
                            (config_id, v["id"], yc, COLORS[idx % len(COLORS)], 1, idx),
                        )
                        idx += 1

    new_conn.commit()
    old_conn.close()
    new_conn.close()

    # Swap databases
    shutil.copy2(OLD_DB, BACKUP_DB)
    os.replace(NEW_DB, OLD_DB)
    print(f"Migration complete. Backup at {BACKUP_DB}")


if __name__ == "__main__":
    migrate()
