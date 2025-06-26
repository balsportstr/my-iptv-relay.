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
    res.send('FINAL MIXED CONTENT FIX - IPTV Relay Server Ready');
});

app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    console.log(`\n=== MIXED CONTENT FIX REQUEST ===`);
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
                url: targetUrl,
                responseType: 'text',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4'
                }
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
                url: targetUrl,
                responseType: 'text',
                timeout: 30000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4'
                }
            });
            
            const content = response.data;
            console.log(`Content received: ${content.length} chars`);
            
            // Check if it's M3U8 playlist
            if (content.includes('#EXTM3U') || content.includes('#EXT-X-')) {
                console.log('>>> M3U8 PLAYLIST - Applying MIXED CONTENT FIX');
                
                const lines = content.split('\n');
                const processedLines = [];
                let baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                
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
                            // Absolute URL
                            mediaUrl = trimmed;
                        } else {
                            // Relative URL - construct absolute URL carefully
                            if (trimmed.startsWith('/')) {
                                // Starts with slash - relative to domain
                                const urlParts = new URL(targetUrl);
                                mediaUrl = `${urlParts.protocol}//${urlParts.host}${trimmed}`;
                            } else {
                                // Relative to current directory
                                mediaUrl = baseUrl + trimmed;
                            }
                        }
                        
                        // Clean up any double slashes (except after protocol)
                        mediaUrl = mediaUrl.replace(/([^:]\/)\/+/g, '$1');
                        
                        // CRITICAL: Force HTTPS to prevent mixed content errors
                        if (mediaUrl.startsWith('http://')) {
                            mediaUrl = mediaUrl.replace('http://', 'https://');
                            console.log(`🔒 HTTP→HTTPS: ${trimmed}`);
                        }
                        
                        // Create HTTPS proxy URL
                        const proxyUrl = `https://${req.get('host')}/proxy?url=${encodeURIComponent(mediaUrl)}`;
                        processedLines.push(proxyUrl);
                        
                        console.log(`✅ ${trimmed} → HTTPS PROXY`);
                        conversions++;
                    } else {
                        // Keep other lines as-is
                        processedLines.push(line);
                    }
                }
                
                const processedContent = processedLines.join('\n');
                
                console.log(`🎯 MIXED CONTENT FIX COMPLETE:`);
                console.log(`  - Conversions: ${conversions}`);
                console.log(`  - All URLs now HTTPS via proxy`);
                console.log(`  - Content length: ${processedContent.length}`);
                
                // Show sample
                const sampleLines = processedContent.split('\n').slice(0, 10);
                console.log(`Sample processed content:`);
                sampleLines.forEach((line, i) => {
                    if (line.trim() && !line.startsWith('#')) {
                        console.log(`  ${i+1}: ${line.substring(0, 100)}...`);
                    }
                });
                
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Cache-Control', 'no-cache');
                res.send(processedContent);
                
            } else {
                console.log('>>> Not M3U8 - treating as stream');
                await streamContent(targetUrl, req, res);
            }
            
        } else {
            // Handle direct stream
            console.log('>>> Direct stream');
            await streamContent(targetUrl, req, res);
        }
        
    } catch (error) {
        console.error(`❌ Error:`, error.message);
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        if (!res.headersSent) {
            res.status(502).json({
                error: `Proxy error: ${error.message}`,
                url: targetUrl,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// Stream content helper
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
        url: targetUrl,
        responseType: 'stream',
        timeout: 120000,
        headers: streamHeaders
    });
    
    console.log(`Stream: ${response.status} ${response.headers['content-type']}`);
    
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
    console.log(`✅ Stream piped`);
    
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
        server: 'mixed-content-fixed',
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
    console.log('🔒 MIXED CONTENT FIXED IPTV PROXY');
    console.log(`📡 Port: ${PORT}`);
    console.log('✅ HTTP→HTTPS conversion');
    console.log('✅ Clean URL construction');
    console.log('✅ Force HTTPS proxy URLs');
    console.log('=====================================');
});
