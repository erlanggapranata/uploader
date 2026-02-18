import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { staticPlugin } from '@elysiajs/static'
import { swagger } from '@elysiajs/swagger'
import path from 'path'
import fs from 'fs/promises'
import { DatabaseManager, UrlRecord } from './database'

// ========================
// CONFIGURATION
// ========================
const CONFIG = {
    PORT: process.env.PORT || 8000,
    UPLOAD_DIR: path.resolve('./public/file'),
    MAX_FILE_SIZE: 50 * 1024 * 1024,        // 50 MB
    SHORT_URL_LENGTH: 6,
    ALLOW_ALL_TYPES: true
}

// ========================
// UTILITIES
// ========================
class Logger {
    private static colors = {
        reset: '\x1b[0m',
        blue: '\x1b[34m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        red: '\x1b[31m',
        magenta: '\x1b[35m',
        gray: '\x1b[90m',
        cyan: '\x1b[36m'
    }

    static info(message: string, ...args: any[]) {
        console.log(`${this.colors.blue}ℹ️  [INFO]${this.colors.reset}`, message, ...args)
    }

    static success(message: string, ...args: any[]) {
        console.log(`${this.colors.green}✓ [SUCCESS]${this.colors.reset}`, message, ...args)
    }

    static warning(message: string, ...args: any[]) {
        console.log(`${this.colors.yellow}⚠️  [WARNING]${this.colors.reset}`, message, ...args)
    }

    static error(message: string, ...args: any[]) {
        console.log(`${this.colors.red}✗ [ERROR]${this.colors.reset}`, message, ...args)
    }

    static cyan(message: string) {
        return `${this.colors.cyan}${message}${this.colors.reset}`
    }

    static gray(message: string) {
        return `${this.colors.gray}${message}${this.colors.reset}`
    }
}

// Generate short code (6 characters)
function generateShortCode(length = CONFIG.SHORT_URL_LENGTH): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    
    return result
}

// Generate unique short code
async function generateUniqueShortCode(): Promise<string> {
    let attempts = 0
    const maxAttempts = 10
    
    while (attempts < maxAttempts) {
        const code = generateShortCode()
        const isUsed = DatabaseManager.isShortCodeUsed(code)
        
        if (!isUsed) {
            return code
        }
        
        attempts++
    }
    
    // If collision after 10 attempts, use longer code
    return generateShortCode(CONFIG.SHORT_URL_LENGTH + 2)
}

function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// ========================
// FILE MANAGER
// ========================
class FileManager {
    static async ensureUploadDir() {
        try {
            await fs.access(CONFIG.UPLOAD_DIR)
            Logger.success('Upload directory verified:', CONFIG.UPLOAD_DIR)
        } catch {
            await fs.mkdir(CONFIG.UPLOAD_DIR, { recursive: true })
            Logger.success('Upload directory created:', CONFIG.UPLOAD_DIR)
        }
    }

    static async getStorageStats() {
        try {
            const files = await fs.readdir(CONFIG.UPLOAD_DIR)
            let totalSize = 0
            let fileCount = 0

            for (const file of files) {
                const filePath = path.join(CONFIG.UPLOAD_DIR, file)
                try {
                    const stats = await fs.stat(filePath)
                    if (stats.isFile()) {
                        totalSize += stats.size
                        fileCount++
                    }
                } catch {
                    // Skip if file is inaccessible
                }
            }

            return { fileCount, totalSize }
        } catch {
            return { fileCount: 0, totalSize: 0 }
        }
    }
}

// ========================
// ELYSIA APP
// ========================
const app = new Elysia()
    .use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'DELETE'],
        allowedHeaders: ['Content-Type']
    }))
    .use(staticPlugin({
        assets: 'public',
        prefix: '',
        alwaysStatic: false
    }))
    .use(swagger({
        documentation: {
            info: {
                title: 'File Upload API - SQLite Edition',
                version: '4.0.0',
                description: `
# File Upload API with SQLite Database

API untuk upload file dengan short URL dan penyimpanan di SQLite database.

## Fitur Utama
- ✅ **SQLite Database**: Penyimpanan URL mapping di database
- ✅ **Short URL**: 6 karakter pendek (contoh: /abc123)
- ✅ **Access Tracking**: Menghitung jumlah akses setiap URL
- ✅ **Support All Files**: Semua jenis file/dokumen diterima
- ✅ **Max Upload**: 50 MB per file
- ✅ **Statistics**: Analytics dan statistik lengkap

## Cara Upload

### Via API (cURL)
\`\`\`bash
curl -X POST http://localhost:8000/upload \\
  -F "file=@/path/to/your/file.pdf"
\`\`\`

### Response Format
\`\`\`json
{
  "status": true,
  "message": "File uploaded successfully",
  "data": {
    "shortCode": "aBc123",
    "shortUrl": "http://localhost:8000/aBc123",
    "directUrl": "http://localhost:8000/file/xyz.pdf",
    "filename": "document.pdf",
    "size": 1024000,
    "sizeFormatted": "1000.00 KB",
    "mimetype": "application/pdf"
  }
}
\`\`\`

## Endpoints Baru
- \`GET /urls\` - List semua URLs
- \`GET /urls/recent\` - URLs terbaru
- \`GET /urls/popular\` - URLs paling sering diakses
- \`GET /urls/search?q=nama\` - Cari URLs
- \`DELETE /urls/:shortCode\` - Hapus URL
                `
            },
            tags: [
                { name: 'Upload', description: 'File upload operations' },
                { name: 'Files', description: 'File access and management' },
                { name: 'URLs', description: 'URL management and statistics' },
                { name: 'System', description: 'System information and health' }
            ]
        }
    }))
    // Health check
    .get('/health', () => {
        return {
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            version: '4.0.0',
            database: 'SQLite',
            features: {
                shortUrl: true,
                accessTracking: true,
                allFileTypes: CONFIG.ALLOW_ALL_TYPES,
                maxSize: formatBytes(CONFIG.MAX_FILE_SIZE)
            }
        }
    }, {
        detail: {
            tags: ['System'],
            summary: 'Health check',
            description: 'Check if the server is running'
        }
    })
    // Upload endpoint
    .post('/upload', async ({  request, set }: any) => {
        try {
            const formData = await request.formData()
            const file = formData.get('file')

            // Validation
            if (!file || !(file instanceof File)) {
                set.status = 400
                return {
                    status: false,
                    message: 'No file uploaded',
                    error: 'MISSING_FILE'
                }
            }

            // Check file size
            if (file.size > CONFIG.MAX_FILE_SIZE) {
                set.status = 413
                return {
                    status: false,
                    message: `File too large. Maximum size is ${formatBytes(CONFIG.MAX_FILE_SIZE)}`,
                    error: 'FILE_TOO_LARGE'
                }
            }

            // Generate unique short code
            const shortCode = await generateUniqueShortCode()
            
            // Generate unique filename
            const timestamp = Date.now()
            const ext = path.extname(file.name)
            const filename = `${timestamp}-${shortCode}${ext}`
            const filePath = path.join(CONFIG.UPLOAD_DIR, filename)

            // Save file
            const arrayBuffer = await file.arrayBuffer()
            await fs.writeFile(filePath, Buffer.from(arrayBuffer))

            // Save to database
            DatabaseManager.insertUrl({
                shortCode: shortCode,
                filename: filename,
                originalName: file.name,
                uploadedAt: new Date().toISOString(),
                size: file.size,
                mimetype: file.type || 'application/octet-stream'
            })

            // Build URLs
            const protocol = request.headers.get('x-forwarded-proto') || 'http'
            const host = request.headers.get('host') || `localhost:${CONFIG.PORT}`
            const shortUrl = `${protocol}://${host}/${shortCode}`
            const directUrl = `${protocol}://${host}/file/${filename}`

            Logger.success(
                `File uploaded: ${file.name} (${formatBytes(file.size)}) → ${shortCode}`
            )

            set.status = 201
            return {
                status: true,
                message: 'File uploaded successfully',
                data: {
                    shortCode: shortCode,
                    shortUrl: shortUrl,
                    directUrl: directUrl,
                    filename: file.name,
                    size: file.size,
                    sizeFormatted: formatBytes(file.size),
                    mimetype: file.type || 'application/octet-stream'
                },
                meta: {
                    uploadedAt: new Date().toISOString()
                }
            }
        } catch (error: any) {
            Logger.error('Upload error:', error.message)
            set.status = 500
            return {
                status: false,
                message: 'Upload failed',
                error: error.message
            }
        }
    }, {
        detail: {
            tags: ['Upload'],
            summary: 'Upload a file',
            description: 'Upload any file type. Returns a short URL (6 characters). Max size: 50MB',
            requestBody: {
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            properties: {
                                file: {
                                    type: 'string',
                                    format: 'binary'
                                }
                            },
                            required: ['file']
                        }
                    }
                }
            }
        }
    })
    // Short URL redirect with access tracking
    .get('/:shortCode', async ({ params, set }) => {
        try {
            const { shortCode } = params
            
            // Check if it's a valid short code
            if (!/^[A-Za-z0-9]{6,8}$/.test(shortCode)) {
                set.status = 404
                return {
                    status: false,
                    message: 'Invalid short code format',
                    error: 'INVALID_SHORT_CODE'
                }
            }

            // Get URL from database
            const urlRecord = DatabaseManager.getUrlByShortCode(shortCode)
            
            if (!urlRecord) {
                set.status = 404
                return {
                    status: false,
                    message: 'Short URL not found',
                    error: 'NOT_FOUND'
                }
            }

            const filePath = path.join(CONFIG.UPLOAD_DIR, urlRecord.filename)

            // Check if file exists
            try {
                await fs.access(filePath)
            } catch {
                set.status = 404
                return {
                    status: false,
                    message: 'File not found',
                    error: 'FILE_NOT_FOUND'
                }
            }

            // Increment access count
            DatabaseManager.incrementAccessCount(shortCode)

            // Return file
            Logger.info(`Short URL accessed: ${shortCode} → ${urlRecord.originalName} (${(urlRecord.accessCount || 0) + 1} views)`)
            return Bun.file(filePath)
        } catch (error: any) {
            Logger.error('Short URL error:', error.message)
            set.status = 500
            return {
                status: false,
                message: 'Internal server error',
                error: error.message
            }
        }
    }, {
        detail: {
            tags: ['Files'],
            summary: 'Access file via short URL',
            description: 'Access file using short code (e.g., /aBc123). Increments access counter.',
            parameters: [
                {
                    name: 'shortCode',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                    description: 'The 6-character short code'
                }
            ]
        }
    })
    // Direct file access
    .get('/file/:filename', async ({ params, set }) => {
        try {
            const filename = params.filename
            const filePath = path.join(CONFIG.UPLOAD_DIR, filename)

            try {
                await fs.access(filePath)
            } catch {
                set.status = 404
                return {
                    status: false,
                    message: 'File not found',
                    error: 'FILE_NOT_FOUND'
                }
            }

            return Bun.file(filePath)
        } catch (error: any) {
            Logger.error('File access error:', error.message)
            set.status = 500
            return {
                status: false,
                message: 'Internal server error',
                error: error.message
            }
        }
    }, {
        detail: {
            tags: ['Files'],
            summary: 'Get file by filename (direct)',
            description: 'Direct file access by filename'
        }
    })
    // Get all URLs with pagination
    .get('/urls', ({ query }) => {
        const limit = parseInt(query.limit as string) || 100
        const offset = parseInt(query.offset as string) || 0

        const urls = DatabaseManager.getAllUrls(limit, offset)
        const total = DatabaseManager.getTotalCount()

        return {
            status: true,
            data: urls,
            pagination: {
                limit,
                offset,
                total,
                hasMore: offset + limit < total
            }
        }
    }, {
        detail: {
            tags: ['URLs'],
            summary: 'Get all URLs',
            description: 'Get paginated list of all uploaded URLs',
            querystring: {
                type: 'object',
                properties: {
                    limit: { type: 'number', default: 100 },
                    offset: { type: 'number', default: 0 }
                }
            }
        }
    })
    // Get recent uploads
    .get('/urls/recent', ({ query }) => {
        const limit = parseInt(query.limit as string) || 10

        const urls = DatabaseManager.getRecentUploads(limit)

        return {
            status: true,
            data: urls
        }
    }, {
        detail: {
            tags: ['URLs'],
            summary: 'Get recent uploads',
            description: 'Get most recently uploaded files'
        }
    })
    // Get most accessed URLs
    .get('/urls/popular', ({ query }) => {
        const limit = parseInt(query.limit as string) || 10

        const urls = DatabaseManager.getMostAccessedUrls(limit)

        return {
            status: true,
            data: urls
        }
    }, {
        detail: {
            tags: ['URLs'],
            summary: 'Get popular URLs',
            description: 'Get most frequently accessed URLs'
        }
    })
    // Search URLs
    .get('/urls/search', ({ query, set }) => {
        const searchQuery = query.q as string

        if (!searchQuery) {
            set.status = 400
            return {
                status: false,
                message: 'Search query is required',
                error: 'MISSING_QUERY'
            }
        }

        const urls = DatabaseManager.searchUrls(searchQuery)

        return {
            status: true,
            data: urls,
            query: searchQuery
        }
    }, {
        detail: {
            tags: ['URLs'],
            summary: 'Search URLs',
            description: 'Search URLs by original filename'
        }
    })
    // Delete URL
    .delete('/urls/:shortCode', ({ params, set }) => {
        try {
            const { shortCode } = params

            const urlRecord = DatabaseManager.getUrlByShortCode(shortCode)

            if (!urlRecord) {
                set.status = 404
                return {
                    status: false,
                    message: 'Short URL not found',
                    error: 'NOT_FOUND'
                }
            }

            // Delete from database
            const deleted = DatabaseManager.deleteUrl(shortCode)

            if (!deleted) {
                set.status = 500
                return {
                    status: false,
                    message: 'Failed to delete URL',
                    error: 'DELETE_FAILED'
                }
            }

            // Delete file (optional - you might want to keep files)
            const filePath = path.join(CONFIG.UPLOAD_DIR, urlRecord.filename)
            fs.unlink(filePath).catch(() => {
                // Ignore file deletion errors
            })

            Logger.success(`URL deleted: ${shortCode} → ${urlRecord.originalName}`)

            return {
                status: true,
                message: 'URL deleted successfully',
                data: {
                    shortCode,
                    originalName: urlRecord.originalName
                }
            }
        } catch (error: any) {
            Logger.error('Delete error:', error.message)
            set.status = 500
            return {
                status: false,
                message: 'Delete failed',
                error: error.message
            }
        }
    }, {
        detail: {
            tags: ['URLs'],
            summary: 'Delete URL',
            description: 'Delete a short URL and optionally its file'
        }
    })
    // Statistics endpoint
    .get('/stats', async () => {
        const storageStats = await FileManager.getStorageStats()
        const dbStats = DatabaseManager.getStats()
        
        return {
            status: true,
            data: {
                database: {
                    totalUrls: dbStats.totalUrls,
                    totalAccess: dbStats.totalAccess,
                    avgFileSize: formatBytes(dbStats.avgFileSize)
                },
                storage: {
                    fileCount: storageStats.fileCount,
                    totalSize: formatBytes(storageStats.totalSize),
                    totalSizeBytes: storageStats.totalSize
                },
                config: {
                    maxFileSize: formatBytes(CONFIG.MAX_FILE_SIZE),
                    allowAllTypes: CONFIG.ALLOW_ALL_TYPES,
                    shortUrlLength: CONFIG.SHORT_URL_LENGTH
                }
            },
            timestamp: new Date().toISOString()
        }
    }, {
        detail: {
            tags: ['System'],
            summary: 'Get statistics',
            description: 'Get comprehensive statistics about uploads and storage'
        }
    })

// ========================
// START SERVER
// ========================
async function startServer() {
    try {
        // Initialize database
        DatabaseManager.init()
        
        // Ensure upload directory exists
        await FileManager.ensureUploadDir()
        
        console.log(Logger.cyan('\n╔════════════════════════════════════════╗'))
        console.log(Logger.cyan('║   FILE UPLOADER v4.0 - SQLite DB      ║'))
        console.log(Logger.cyan('╚════════════════════════════════════════╝\n'))
        
        Logger.info('Configuration:')
        console.log(Logger.gray(`  Port:              ${CONFIG.PORT}`))
        console.log(Logger.gray(`  Upload Directory:  ${CONFIG.UPLOAD_DIR}`))
        console.log(Logger.gray(`  Database:          SQLite (data/urls.db)`))
        console.log(Logger.gray(`  Max File Size:     ${formatBytes(CONFIG.MAX_FILE_SIZE)}`))
        console.log(Logger.gray(`  Short URL Length:  ${CONFIG.SHORT_URL_LENGTH} characters`))
        console.log(Logger.gray(`  File Types:        All types allowed ✅`))
        console.log(Logger.gray(`  Access Tracking:   Enabled ✅\n`))
       
        app.listen(CONFIG.PORT)
        
        console.log(Logger.cyan(`\n✓ Server running at http://localhost:${CONFIG.PORT}`))
        console.log(Logger.cyan(`✓ Swagger docs at http://localhost:${CONFIG.PORT}/swagger\n`))
        console.log(Logger.gray(`  Example short URL: http://localhost:${CONFIG.PORT}/aBc123`))
        console.log(Logger.gray(`  Press Ctrl+C to stop\n`))
        
    } catch (error: any) {
        Logger.error('Failed to start server:', error.message)
        process.exit(1)
    }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    Logger.warning('Received SIGTERM signal. Shutting down gracefully...')
    DatabaseManager.close()
    process.exit(0)
})

process.on('SIGINT', async () => {
    Logger.warning('\nReceived SIGINT signal. Shutting down gracefully...')
    DatabaseManager.close()
    process.exit(0)
})

startServer()
