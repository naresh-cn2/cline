import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveClineDataDir, resolveClineDir } from "@cline/shared/storage";

/**
 * Safely imports existing local sessions from an original ~/.cline installation
 * into the isolated OPEN VERSE data directory (~/.openverse) on startup.
 *
 * Requirements:
 * - Read-only access to ~/.cline (never modifies or locks original data)
 * - Idempotent (INSERT OR IGNORE; skips already-imported sessions and files)
 * - Preserves all session IDs, timestamps, prompts, and metadata
 */
export function migrateOriginalClineProfileIfNeeded(): {
	migratedSessions: number;
} {
	try {
		const clineDir = join(homedir(), ".cline");
		const currentDir = resolveClineDir();

		// If current profile is the original .cline directory, no migration needed
		if (clineDir.toLowerCase() === currentDir.toLowerCase()) {
			return { migratedSessions: 0 };
		}

		const clineDbPath = join(clineDir, "data", "db", "sessions.db");
		if (!existsSync(clineDbPath)) {
			return { migratedSessions: 0 };
		}

		const openverseDataDir = resolveClineDataDir();
		const openverseDbDir = join(openverseDataDir, "db");
		const openverseDbPath = join(openverseDbDir, "sessions.db");
		const clineSessionsDir = join(clineDir, "data", "sessions");
		const openverseSessionsDir = join(openverseDataDir, "sessions");

		mkdirSync(openverseDbDir, { recursive: true });
		mkdirSync(openverseSessionsDir, { recursive: true });

		const clineDb = new Database(clineDbPath, { readonly: true });
		let clineSessions: Record<string, unknown>[];
		try {
			clineSessions = clineDb.query("SELECT * FROM sessions").all() as Record<
				string,
				unknown
			>[];
		} catch {
			clineDb.close();
			return { migratedSessions: 0 };
		}

		if (clineSessions.length === 0) {
			clineDb.close();
			return { migratedSessions: 0 };
		}

		const ovDb = new Database(openverseDbPath);

		// Ensure sessions table exists in destination
		const tableCheck = ovDb
			.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'",
			)
			.get();
		if (!tableCheck) {
			const schema = clineDb
				.query(
					"SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'",
				)
				.get() as { sql?: string } | null;
			if (schema?.sql) {
				ovDb.run(schema.sql);
			}
		}

		let migratedSessions = 0;
		const columns = Object.keys(clineSessions[0] || {});
		const placeholders = columns.map(() => "?").join(", ");
		const insertStmt = ovDb.prepare(
			`INSERT OR IGNORE INTO sessions (${columns.join(", ")}) VALUES (${placeholders})`,
		);

		ovDb.transaction(() => {
			for (const session of clineSessions) {
				const values = columns.map((c) => session[c]);
				const result = insertStmt.run(...values);
				if (result.changes > 0) {
					migratedSessions++;
				}
			}
		})();

		// Copy session message directories
		for (const session of clineSessions) {
			const sessionId = String(session.session_id ?? "").trim();
			if (!sessionId) continue;
			const srcDir = join(clineSessionsDir, sessionId);
			const destDir = join(openverseSessionsDir, sessionId);
			if (existsSync(srcDir) && !existsSync(destDir)) {
				try {
					cpSync(srcDir, destDir, { recursive: true });
				} catch {
					// best-effort per directory
				}
			}
		}

		clineDb.close();
		ovDb.close();

		return { migratedSessions };
	} catch (error) {
		console.warn("[profile-migration] Migration notice:", error);
		return { migratedSessions: 0 };
	}
}
