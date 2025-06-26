const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// CRITICAL: Enhanced CORS middleware that ALWAYS applies headers
app.use((req, res, next) => {
    // Apply CORS headers to EVERY response, including errors
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    
    // Handle preflight OPTIONS requests immediately
    if (req.method === 'OPTIONS') {
        console.log('✅ CORS: Handling OPTIONS preflight request');
        return res.status(200).end();
    }
    
    // Continue to next middleware
    next();
});

// Additional error-handling CORS middleware
app.use((req, res, next) => {
    // Override res.status to ensure CORS headers are always included
    const originalStatus = res.status;
    res.status = function(code) {
        // Re-apply CORS headers even when setting error status
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
        return originalStatus.call(this, code);
    };
    
    // Override res.json to ensure CORS headers are included
    const originalJson = res.json;
    res.json = function(obj) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return originalJson.call(this, obj);
    };
    
    // Override res.send to ensure CORS headers are included
    const originalSend = res.send;
    res.send = function(body) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return originalSend.call(this, body);
    };
    
    next();
});

app.get('/', (req, res) => {
    res.send('Enhanced IPTV Relay Server with Fixed CORS is running. Use the /proxy endpoint.');
});

app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    console.log(`\n=== PROXY REQUEST ===`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Method: ${req.method}`);
    console.log(`Target URL: ${targetUrl}`);
    console.log(`Origin: ${req.headers.origin || 'No Origin'}`);
    console.log(`User-Agent: ${req.headers['user-agent']}`);
    
    // CRITICAL: Ensure CORS headers are set immediately
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
    
    if (!targetUrl) {
        console.log('❌ CORS: Missing URL parameter');
        return res.status(400).json({ 
            error: 'Error: "url" query parameter is required.',
            timestamp: new Date().toISOString()
        });
    }
    
    try {
        // Enhanced content type detection
        const isM3URequest = targetUrl.includes('m3u') || 
                           targetUrl.includes('get.php') || 
                           targetUrl.includes('playlist') ||
                           targetUrl.includes('type=m3u');
        
        // Better Xtream stream detection
        const isXtreamStream = !isM3URequest && (
            targetUrl.match(/\/\d+$/) ||           // ends with numbers (Xtream channel ID)
            targetUrl.includes('/live/') ||        // contains /live/
            targetUrl.includes('/movie/') ||       // contains /movie/
            targetUrl.includes('/series/')         // contains /series/
        );
        
        const isM3U8File = targetUrl.includes('.m3u8');
        const isDirectVideoFile = targetUrl.match(/\.(mp4|mkv|avi|mov|ts)$/);
        
        console.log(`Content type detection:`);
        console.log(`  - M3U Request: ${isM3URequest}`);
        console.log(`  - Xtream Stream: ${isXtreamStream}`);
        console.log(`  - M3U8 File: ${isM3U8File}`);
        console.log(`  - Direct Video: ${isDirectVideoFile}`);
        
        if (isM3URequest) {
            // Handle M3U playlists
            console.log('>>> CORS: Handling M3U playlist request');
            
            const response = await axios({
                method: 'get',
                url: targetUrl,
                responseType: 'text',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': 'application/vnd.apple.mpegurl,text/plain,*/*'
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 500; // Don't throw on 4xx errors
                }
            });
            
            // Ensure CORS headers on response
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
            res.setHeader('Cache-Control', 'no-cache');
            
            res.send(response.data);
            console.log(`✅ CORS: M3U playlist served: ${response.data.length} bytes`);
            
        } else if (isXtreamStream || isM3U8File) {
            // Handle Xtream streams or M3U8 files
            console.log('>>> CORS: Handling Xtream/M3U8 stream - analyzing content...');
            
            // Step 1: Check what this URL actually returns with enhanced error handling
            let sampleResponse;
            try {
                sampleResponse = await axios({
                    method: req.method.toLowerCase(),
                    url: targetUrl,
                    timeout: 30000,
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                        'Referer': 'http://localhost/',
                        'Accept': '*/*',
                        'Range': req.headers.range || 'bytes=0-2047' // First 2KB for analysis
                    },
                    validateStatus: function (status) {
                        return status >= 200 && status < 500; // Don't throw on 4xx errors
                    },
                    maxRedirects: 5 // Follow redirects
                });
                
                console.log(`CORS: Sample response status: ${sampleResponse.status}`);
                
            } catch (axiosError) {
                console.log('⚠️ CORS: Range request failed, trying without range...');
                
                // Fallback: try without range header
                try {
                    sampleResponse = await axios({
                        method: req.method.toLowerCase(),
                        url: targetUrl,
                        timeout: 30000,
                        responseType: 'arraybuffer',
                        maxContentLength: 2048, // Limit to 2KB
                        headers: {
                            'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                            'Referer': 'http://localhost/',
                            'Accept': '*/*'
                        },
                        validateStatus: function (status) {
                            return status >= 200 && status < 500;
                        },
                        maxRedirects: 5
                    });
                    
                    console.log(`CORS: Fallback response status: ${sampleResponse.status}`);
                    
                } catch (fallbackError) {
                    console.error('❌ CORS: Both sample requests failed:', fallbackError.message);
                    
                    // Ensure CORS headers on error response
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    return res.status(502).json({
                        error: `Failed to fetch Xtream stream: ${fallbackError.message}`,
                        targetUrl: targetUrl,
                        timestamp: new Date().toISOString(),
                        details: {
                            type: 'XTREAM_FETCH_ERROR',
                            originalError: fallbackError.code
                        }
                    });
                }
            }
            
            const contentType = sampleResponse.headers['content-type'] || '';
            const sampleContent = Buffer.from(sampleResponse.data).toString('utf8', 0, Math.min(2048, sampleResponse.data.byteLength));
            
            console.log(`CORS: Sample analysis:`);
            console.log(`  - Content-Type: ${contentType}`);
            console.log(`  - Sample content (first 200 chars): ${sampleContent.substring(0, 200)}`);
            console.log(`  - Contains #EXTM3U: ${sampleContent.includes('#EXTM3U')}`);
            console.log(`  - Contains #EXT-X-: ${sampleContent.includes('#EXT-X-')}`);
            
            // Determine if it's a playlist or stream
            const isPlaylist = sampleContent.includes('#EXTM3U') || 
                             sampleContent.includes('#EXT-X-') || 
                             sampleContent.includes('.m3u8') ||
                             contentType.includes('mpegurl') || 
                             contentType.includes('m3u');
            
            if (isPlaylist) {
                console.log('>>> CORS: Detected as M3U8 playlist - serving as text');
                
                // Get full playlist content
                const fullResponse = await axios({
                    method: 'get',
                    url: targetUrl,
                    responseType: 'text',
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                        'Referer': 'http://localhost/',
                        'Accept': 'application/vnd.apple.mpegurl,text/plain,*/*'
                    },
                    validateStatus: function (status) {
                        return status >= 200 && status < 500;
                    }
                });
                
                let content = fullResponse.data;
                console.log(`CORS: Full playlist content length: ${content.length}`);
                
                // Process relative URLs in M3U8
                if (content.includes('.ts') || content.includes('.m3u8')) {
                    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                    
                    // Convert relative .ts URLs
                    content = content.replace(/^(?!https?:\/\/)([^#\n\r][^\n\r]*\.ts[^\n\r]*)$/gm, (match, filename) => {
                        const fullUrl = baseUrl + filename.trim();
                        const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(fullUrl)}`;
                        console.log(`    CORS: Converting TS: ${filename.trim()} -> ${proxyUrl}`);
                        return proxyUrl;
                    });
                    
                    // Convert relative .m3u8 URLs
                    content = content.replace(/^(?!https?:\/\/)([^#\n\r][^\n\r]*\.m3u8[^\n\r]*)$/gm, (match, filename) => {
                        const fullUrl = baseUrl + filename.trim();
                        const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(fullUrl)}`;
                        console.log(`    CORS: Converting M3U8: ${filename.trim()} -> ${proxyUrl}`);
                        return proxyUrl;
                    });
                }
                
                // Ensure CORS headers on playlist response
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
                res.send(content);
                
                console.log(`✅ CORS: M3U8 playlist processed and served: ${content.length} chars`);
                
            } else {
                console.log('>>> CORS: Detected as streaming video content - setting up stream proxy');
                
                // Handle as streaming video content
                const streamHeaders = {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': '*/*',
                    'Connection': 'keep-alive'
                };
                
                // Forward range header if present
                if (req.headers.range) {
                    streamHeaders['Range'] = req.headers.range;
                    console.log(`    CORS: Forwarding Range header: ${req.headers.range}`);
                }
                
                const response = await axios({
                    method: req.method.toLowerCase(),
                    url: targetUrl,
                    responseType: 'stream',
                    timeout: 180000,
                    headers: streamHeaders,
                    validateStatus: function (status) {
                        return status >= 200 && status < 500;
                    }
                });
                
                console.log(`CORS: Stream response:`);
                console.log(`    Status: ${response.status}`);
                console.log(`    Content-Type: ${response.headers['content-type']}`);
                console.log(`    Content-Length: ${response.headers['content-length']}`);
                
                // Ensure CORS headers on stream response
                res.setHeader('Access-Control-Allow-Origin', '*');
                
                // Forward relevant headers
                if (response.headers['content-type']) {
                    res.setHeader('Content-Type', response.headers['content-type']);
                }
                if (response.headers['content-length']) {
                    res.setHeader('Content-Length', response.headers['content-length']);
                }
                if (response.headers['accept-ranges']) {
                    res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
                }
                if (response.headers['content-range']) {
                    res.setHeader('Content-Range', response.headers['content-range']);
                    res.status(206); // Partial Content
                }
                
                // Additional streaming headers
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                
                // Pipe the stream
                response.data.pipe(res);
                console.log(`✅ CORS: Video stream piped successfully`);
                
                // Handle stream errors
                response.data.on('error', (error) => {
                    console.error('CORS: Stream error:', error.message);
                    if (!res.headersSent) {
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.status(500).json({ 
                            error: 'Stream error: ' + error.message,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
                
                res.on('close', () => {
                    console.log('CORS: Client disconnected from stream');
                    if (response.data && response.data.destroy) {
                        response.data.destroy();
                    }
                });
            }
            
        } else {
            // Handle other content (images, etc.)
            console.log('>>> CORS: Handling other content as binary');
            
            const response = await axios({
                method: req.method.toLowerCase(),
                url: targetUrl,
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': req.headers.accept || '*/*'
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 500;
                }
            });
            
            // Ensure CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }
            
            res.send(Buffer.from(response.data));
            console.log(`✅ CORS: Other content served: ${response.data.byteLength} bytes`);
        }
        
    } catch (error) {
        console.error('\n❌ CORS: PROXY ERROR:');
        console.error(`  Message: ${error.message}`);
        console.error(`  Code: ${error.code}`);
        console.error(`  Target URL: ${targetUrl}`);
        
        // CRITICAL: Ensure CORS headers are included in error responses
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
        
        if (error.response) {
            console.error(`  Response Status: ${error.response.status}`);
            console.error(`  Response Headers:`, error.response.headers);
        }
        
        const statusCode = error.response?.status || 502;
        const errorMessage = `Proxy Error: ${error.message}`;
        
        // Ensure error response includes CORS headers
        if (!res.headersSent) {
            res.status(statusCode).json({
                error: errorMessage,
                targetUrl: targetUrl,
                timestamp: new Date().toISOString(),
                details: {
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    type: 'PROXY_ERROR'
                }
            });
        }
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cors: 'enhanced'
    });
});

// Global error handler with CORS
app.use((error, req, res, next) => {
    console.error('Global error handler:', error.message);
    
    // Ensure CORS headers even in global error handler
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
    
    if (!res.headersSent) {
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString(),
            type: 'GLOBAL_ERROR'
        });
    }
});

app.listen(PORT, () => {
    console.log('=================================');
    console.log('🚀 Enhanced IPTV Relay Server with Fixed CORS');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📺 Proxy endpoint: http://localhost:${PORT}/proxy?url=TARGET_URL`);
    console.log('✅ CORS: Enhanced cross-origin support enabled');
    console.log('=================================');
});
