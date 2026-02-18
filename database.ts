import { Database } from 'bun:sqlite';
import path from 'path';
import fs from 'fs';

// ========================
// DATABASE CONFIGURATION
// ========================
const DB_PATH = path.resolve('./data/urls.db');

export interface UrlRecord {
    id?: number;
    shortCode: string;
    filename: string;
    originalName: string;
    uploadedAt: string;
    size: number;
    mimetype: string;
    accessCount?: number;
    lastAccessedAt?: string | null;
}

// ========================
// DATABASE MANAGER
// ========================
export class DatabaseManager {
    private static db: Database | null = null;

    /**
     * Initialize database connection and create tables
     */
    static init(): void {
        try {
            // Create data directory if not exists
            const dataDir = path.dirname(DB_PATH);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Open database connection
            this.db = new Database(DB_PATH, { create: true });
            this.db.exec('PRAGMA journal_mode = WAL'); // Write-Ahead Logging for better performance

            // Create urls table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS urls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    shortCode TEXT UNIQUE NOT NULL,
                    filename TEXT NOT NULL,
                    originalName TEXT NOT NULL,
                    uploadedAt TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    mimetype TEXT NOT NULL,
                    accessCount INTEGER DEFAULT 0,
                    lastAccessedAt TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_shortCode ON urls(shortCode);
                CREATE INDEX IF NOT EXISTS idx_uploadedAt ON urls(uploadedAt);
            `);

            console.log('✓ SQLite database initialized:', DB_PATH);
        } catch (error) {
            console.error('✗ Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    static close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('✓ Database connection closed');
        }
    }

    /**
     * Insert new URL mapping
     */
    static insertUrl(data: Omit<UrlRecord, 'id' | 'accessCount' | 'lastAccessedAt'>): void {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            INSERT INTO urls (shortCode, filename, originalName, uploadedAt, size, mimetype)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            data.shortCode,
            data.filename,
            data.originalName,
            data.uploadedAt,
            data.size,
            data.mimetype
        );
    }

    /**
     * Get URL mapping by short code
     */
    static getUrlByShortCode(shortCode: string): UrlRecord | undefined {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT * FROM urls WHERE shortCode = ?
        `);

        return stmt.get(shortCode) as UrlRecord | undefined;
    }

    /**
     * Check if short code exists
     */
    static isShortCodeUsed(shortCode: string): boolean {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM urls WHERE shortCode = ?
        `);

        const result = stmt.get(shortCode) as { count: number };
        return result.count > 0;
    }

    /**
     * Increment access count for a URL
     */
    static incrementAccessCount(shortCode: string): void {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            UPDATE urls 
            SET accessCount = accessCount + 1,
                lastAccessedAt = ?
            WHERE shortCode = ?
        `);

        stmt.run(new Date().toISOString(), shortCode);
    }

    /**
     * Get all URLs with pagination
     */
    static getAllUrls(limit = 100, offset = 0): UrlRecord[] {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT * FROM urls 
            ORDER BY uploadedAt DESC 
            LIMIT ? OFFSET ?
        `);

        return stmt.all(limit, offset) as UrlRecord[];
    }

    /**
     * Get total count of URLs
     */
    static getTotalCount(): number {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM urls
        `);

        const result = stmt.get() as { count: number };
        return result.count;
    }

    /**
     * Get statistics
     */
    static getStats(): {
        totalUrls: number;
        totalSize: number;
        totalAccess: number;
        avgFileSize: number;
    } {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT 
                COUNT(*) as totalUrls,
                SUM(size) as totalSize,
                SUM(accessCount) as totalAccess,
                AVG(size) as avgFileSize
            FROM urls
        `);

        const result = stmt.get() as any;
        return {
            totalUrls: result.totalUrls || 0,
            totalSize: result.totalSize || 0,
            totalAccess: result.totalAccess || 0,
            avgFileSize: result.avgFileSize || 0
        };
    }

    /**
     * Delete URL by short code
     */
    static deleteUrl(shortCode: string): boolean {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            DELETE FROM urls WHERE shortCode = ?
        `);

        stmt.run(shortCode);
        return this.db.changes > 0;
    }

    /**
     * Search URLs by original name
     */
    static searchUrls(query: string, limit = 50): UrlRecord[] {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT * FROM urls 
            WHERE originalName LIKE ? 
            ORDER BY uploadedAt DESC 
            LIMIT ?
        `);

        return stmt.all(`%${query}%`, limit) as UrlRecord[];
    }

    /**
     * Get most accessed URLs
     */
    static getMostAccessedUrls(limit = 10): UrlRecord[] {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT * FROM urls 
            WHERE accessCount > 0
            ORDER BY accessCount DESC 
            LIMIT ?
        `);

        return stmt.all(limit) as UrlRecord[];
    }

    /**
     * Get recent uploads
     */
    static getRecentUploads(limit = 10): UrlRecord[] {
        if (!this.db) throw new Error('Database not initialized');

        const stmt = this.db.prepare(`
            SELECT * FROM urls 
            ORDER BY uploadedAt DESC 
            LIMIT ?
        `);

        return stmt.all(limit) as UrlRecord[];
    }
}

