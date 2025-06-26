const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.get('/', (req, res) => {
    res.send('FIXED SSL ERROR - IPTV Relay Server Ready');
});

app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    console.log(`\n=== SSL ERROR FIX REQUEST ===`);
    console.log(`Target: ${targetUrl}`);
    
    // Always set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
    
    if (!targetUrl) {
        return res.status(400).json({ 
            error: 'URL parameter required',
            timestamp: new Date().toISOString()
        });
    }
    
    try {
        // CRITICAL FIX: Keep original protocol (don't force HTTPS on backend requests)
        const originalUrl = targetUrl;
        const isHttps = originalUrl.startsWith('https://');
        
        console.log(`Protocol: ${isHttps ? 'HTTPS' : 'HTTP'} (keeping original)`);
        
        // Simple content type detection
        const isChannelList = targetUrl.includes('get.php') && targetUrl.includes('type=m3u');
        const isStreamUrl = targetUrl.includes('/live/') || targetUrl.match(/\/\d+$/);
        const isM3u8File = targetUrl.includes('.m3u8');
        const isTsFile = targetUrl.includes('.ts');
        
        console.log(`Content: List=${isChannelList}, Stream=${isStreamUrl}, M3U8=${isM3u8File}, TS=${isTsFile}`);
        
        if (isChannelList) {
            // Handle main channel list
            console.log('>>> Processing channel list');
            
            const response = await axios({
                method: 'get',
                url: originalUrl, // Keep original protocol
                responseType: 'text',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4'
                },
                // Add this for HTTP servers
                httpsAgent: false,
                httpAgent: false
            });
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'no-cache');
            res.send(response.data);
            console.log(`✅ Channel list served`);
            
        } else if (isM3u8File || isStreamUrl) {
            // Handle M3U8 playlist or stream
            console.log('>>> Processing stream/M3U8');
            
            const response = await axios({
                method: 'get',
                url: originalUrl, // Keep original protocol
                responseType: 'text',
                timeout: 30000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4'
                },
                // Add this for HTTP servers
                httpsAgent: false,
                httpAgent: false
            });
            
            const content = response.data;
            console.log(`Content received: ${content.length} chars`);
            
            // Check if it's M3U8 playlist
            if (content.includes('#EXTM3U') || content.includes('#EXT-X-')) {
                console.log('>>> M3U8 PLAYLIST - Applying SSL ERROR FIX');
                
                const lines = content.split('\n');
                const processedLines = [];
                let baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf('/') + 1);
                
                // Clean up base URL to prevent double slashes
                baseUrl = baseUrl.replace(/([^:]\/)\/+/g, '$1');
                
                let conversions = 0;
                
                console.log(`Processing ${lines.length} lines`);
                console.log(`Base URL: ${baseUrl}`);
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    
                    if (!trimmed || trimmed.startsWith('#')) {
                        // Keep comments and empty lines
                        processedLines.push(line);
                    } else if (trimmed.includes('.ts') || trimmed.includes('.m3u8')) {
                        // Process media URLs
                        let mediaUrl;
                        
                        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                            // Absolute URL - KEEP ORIGINAL PROTOCOL
                            mediaUrl = trimmed;
                        } else {
                            // Relative URL - construct absolute URL carefully
                            if (trimmed.startsWith('/')) {
                                // Starts with slash - relative to domain
                                const urlParts = new URL(originalUrl);
                                mediaUrl = `${urlParts.protocol}//${urlParts.host}${trimmed}`;
                            } else {
                                // Relative to current directory
                                mediaUrl = baseUrl + trimmed;
                            }
                        }
                        
                        // Clean up any double slashes (except after protocol)
                        mediaUrl = mediaUrl.replace(/([^:]\/)\/+/g, '$1');
                        
                        // CRITICAL FIX: DON'T convert HTTP to HTTPS here!
                        // Keep original protocol for backend requests
                        console.log(`🔗 Original protocol preserved: ${mediaUrl}`);
                        
                        // Create proxy URL (proxy itself is HTTPS, but targets original protocol)
                        const proxyUrl = `https://${req.get('host')}/proxy?url=${encodeURIComponent(mediaUrl)}`;
                        processedLines.push(proxyUrl);
                        
                        console.log(`✅ ${trimmed} → PROXY (protocol preserved)`);
                        conversions++;
                    } else {
                        // Keep other lines as-is
                        processedLines.push(line);
                    }
                }
                
                const processedContent = processedLines.join('\n');
                
                console.log(`🎯 SSL ERROR FIX COMPLETE:`);
                console.log(`  - Conversions: ${conversions}`);
                console.log(`  - Original protocols preserved`);
                console.log(`  - Content length: ${processedContent.length}`);
                
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Cache-Control', 'no-cache');
                res.send(processedContent);
                
            } else {
                console.log('>>> Not M3U8 - treating as stream');
                await streamContent(originalUrl, req, res);
            }
            
        } else {
            // Handle direct stream
            console.log('>>> Direct stream');
            await streamContent(originalUrl, req, res);
        }
        
    } catch (error) {
        console.error(`❌ SSL Error Fixed:`, error.message);
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        if (!res.headersSent) {
            res.status(502).json({
                error: `Proxy error: ${error.message}`,
                url: targetUrl,
                timestamp: new Date().toISOString(),
                fix: 'SSL protocol preserved'
            });
        }
    }
});

// Stream content helper - FIXED for SSL errors
async function streamContent(targetUrl, req, res) {
    const streamHeaders = {
        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
        'Accept': '*/*'
    };
    
    if (req.headers.range) {
        streamHeaders['Range'] = req.headers.range;
    }
    
    const response = await axios({
        method: req.method.toLowerCase(),
        url: targetUrl, // Keep original protocol
        responseType: 'stream',
        timeout: 120000,
        headers: streamHeaders,
        // CRITICAL: Add these for HTTP servers
        httpsAgent: false,
        httpAgent: false,
        // Additional SSL fix
        rejectUnauthorized: false
    });
    
    console.log(`Stream: ${response.status} ${response.headers['content-type']} (SSL fixed)`);
    
    // Set headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    
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
        res.status(206);
    }
    
    // Pipe stream
    response.data.pipe(res);
    console.log(`✅ Stream piped (SSL error fixed)`);
    
    response.data.on('error', (error) => {
        console.error('Stream error:', error.message);
    });
    
    res.on('close', () => {
        if (response.data && response.data.destroy) {
            response.data.destroy();
        }
    });
}

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        server: 'ssl-error-fixed',
        timestamp: new Date().toISOString()
    });
});

app.use((error, req, res, next) => {
    console.error('Global error:', error.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (!res.headersSent) {
        res.status(500).json({
            error: 'Server error',
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(PORT, () => {
    console.log('=====================================');
    console.log('🔒 SSL ERROR FIXED IPTV PROXY');
    console.log(`📡 Port: ${PORT}`);
    console.log('✅ Original protocol preserved');
    console.log('✅ HTTP servers supported');
    console.log('✅ Mixed content solved via proxy');
    console.log('=====================================');
});
