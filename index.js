const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// ROBUST CORS middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
        console.log('✅ CORS: OPTIONS request handled');
        return res.status(200).end();
    }
    next();
});

app.get('/', (req, res) => {
    res.send('GUARANTEED WORKING IPTV Relay Server - Simple & Robust M3U8 Processing');
});

app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    console.log(`\n=== GUARANTEED PROXY REQUEST ===`);
    console.log(`Time: ${new Date().toISOString()}`);
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
        
        console.log(`Content type: List=${isChannelList}, Stream=${isStreamUrl}, M3U8=${isM3u8File}, TS=${isTsFile}`);
        
        if (isChannelList) {
            // Handle main channel list (no processing needed)
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
            console.log(`✅ Channel list served: ${response.data.length} bytes`);
            
        } else if (isM3u8File || isStreamUrl) {
            // Handle M3U8 playlist or stream that might return M3U8
            console.log('>>> Processing M3U8 stream/playlist');
            
            // First, get the content to check what it is
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
            console.log(`Got content: ${content.length} chars`);
            console.log(`Sample: ${content.substring(0, 200)}`);
            
            // Check if it's actually an M3U8 playlist
            if (content.includes('#EXTM3U') || content.includes('#EXT-X-')) {
                console.log('>>> CONFIRMED: M3U8 playlist - applying SIMPLE processing');
                
                // SIMPLE LINE-BY-LINE PROCESSING
                const lines = content.split('\n');
                const processedLines = [];
                const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                let conversions = 0;
                
                console.log(`Processing ${lines.length} lines with base: ${baseUrl}`);
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    
                    if (!trimmed || trimmed.startsWith('#')) {
                        // Comment or empty line - keep as-is
                        processedLines.push(line);
                    } else if (trimmed.includes('.ts') || trimmed.includes('.m3u8')) {
                        // Media file line - needs processing
                        let mediaUrl;
                        
                        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                            // Already absolute URL
                            mediaUrl = trimmed;
                        } else {
                            // Relative URL - make absolute
                            mediaUrl = baseUrl + trimmed;
                        }
                        
                        // Create proxy URL
                        const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(mediaUrl)}`;
                        processedLines.push(proxyUrl);
                        
                        console.log(`  Converted: ${trimmed} -> ${mediaUrl} -> PROXY`);
                        conversions++;
                    } else {
                        // Other line - keep as-is
                        processedLines.push(line);
                    }
                }
                
                const processedContent = processedLines.join('\n');
                
                console.log(`✅ M3U8 processing complete: ${conversions} conversions`);
                console.log(`Processed sample: ${processedContent.substring(0, 300)}`);
                
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Cache-Control', 'no-cache');
                res.send(processedContent);
                
            } else {
                console.log('>>> Not M3U8 content - treating as stream');
                // Not M3U8, treat as direct stream
                await streamContent(targetUrl, req, res);
            }
            
        } else {
            // Handle direct stream (TS file or other video)
            console.log('>>> Processing direct stream');
            await streamContent(targetUrl, req, res);
        }
        
    } catch (error) {
        console.error(`❌ Proxy error:`, error.message);
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

// Helper function to stream content
async function streamContent(targetUrl, req, res) {
    const streamHeaders = {
        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
        'Accept': '*/*'
    };
    
    // Forward range header if present
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
    
    console.log(`Stream response: ${response.status} ${response.headers['content-type']}`);
    
    // Set response headers
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
    
    // Pipe the stream
    response.data.pipe(res);
    console.log(`✅ Stream piped successfully`);
    
    // Handle errors
    response.data.on('error', (error) => {
        console.error('Stream error:', error.message);
    });
    
    res.on('close', () => {
        console.log('Client disconnected');
        if (response.data && response.data.destroy) {
            response.data.destroy();
        }
    });
}

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        server: 'guaranteed-working',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error:', error.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (!res.headersSent) {
        res.status(500).json({
            error: 'Server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(PORT, () => {
    console.log('=====================================');
    console.log('🚀 GUARANTEED WORKING IPTV PROXY');
    console.log(`📡 Port: ${PORT}`);
    console.log('✅ Simple & Robust M3U8 Processing');
    console.log('✅ Line-by-line URL conversion');
    console.log('✅ Enhanced CORS support');
    console.log('=====================================');
});
