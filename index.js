const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced CORS middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    if (req.method === 'OPTIONS') return res.status(200).end();
    next();
});

app.get('/', (req, res) => {
    res.send('IPTV Relay Server is running. Use the /proxy endpoint.');
});

app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Error: "url" query parameter is required.');
    }
    
    console.log(`\n=== NEW REQUEST ===`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Method: ${req.method}`);
    console.log(`Target URL: ${targetUrl}`);
    console.log(`User-Agent: ${req.headers['user-agent']}`);
    console.log(`Range: ${req.headers.range || 'None'}`);
    
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
            console.log('>>> Handling M3U playlist request');
            
            const response = await axios({
                method: 'get',
                url: targetUrl,
                responseType: 'text',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': 'application/vnd.apple.mpegurl,text/plain,*/*'
                }
            });
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
            res.setHeader('Cache-Control', 'no-cache');
            res.send(response.data);
            
            console.log(`✅ M3U playlist served: ${response.data.length} bytes`);
            
        } else if (isXtreamStream || isM3U8File) {
            // Handle Xtream streams or M3U8 files - need to detect actual content type
            console.log('>>> Handling Xtream/M3U8 stream - analyzing content...');
            
            // Step 1: Check what this URL actually returns
            let sampleResponse;
            try {
                sampleResponse = await axios({
                    method: 'get',
                    url: targetUrl,
                    timeout: 30000,
                    responseType: 'arraybuffer', // Get raw bytes
                    headers: {
                        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                        'Referer': 'http://localhost/',
                        'Accept': '*/*',
                        'Range': 'bytes=0-2047' // Only first 2KB for analysis
                    }
                });
            } catch (rangeError) {
                // If range requests aren't supported, try without range
                console.log('Range request failed, trying without range...');
                sampleResponse = await axios({
                    method: 'get',
                    url: targetUrl,
                    timeout: 30000,
                    responseType: 'arraybuffer',
                    maxContentLength: 2048, // Limit to 2KB
                    headers: {
                        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                        'Referer': 'http://localhost/',
                        'Accept': '*/*'
                    }
                });
            }
            
            const contentType = sampleResponse.headers['content-type'] || '';
            const sampleContent = Buffer.from(sampleResponse.data).toString('utf8', 0, Math.min(2048, sampleResponse.data.byteLength));
            
            console.log(`Sample analysis:`);
            console.log(`  - Content-Type: ${contentType}`);
            console.log(`  - Sample content (first 200 chars): ${sampleContent.substring(0, 200)}`);
            console.log(`  - Contains #EXTM3U: ${sampleContent.includes('#EXTM3U')}`);
            console.log(`  - Contains #EXT-X-: ${sampleContent.includes('#EXT-X-')}`);
            console.log(`  - Contains .m3u8: ${sampleContent.includes('.m3u8')}`);
            console.log(`  - Contains .ts: ${sampleContent.includes('.ts')}`);
            
            // Determine if it's a playlist or stream
            const isPlaylist = sampleContent.includes('#EXTM3U') || 
                             sampleContent.includes('#EXT-X-') || 
                             sampleContent.includes('.m3u8') ||
                             contentType.includes('mpegurl') || 
                             contentType.includes('m3u');
            
            if (isPlaylist) {
                console.log('>>> Detected as M3U8 playlist - serving as text with URL processing');
                
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
                    }
                });
                
                let content = fullResponse.data;
                console.log(`Full playlist content length: ${content.length}`);
                
                // Process relative URLs in M3U8 - convert them to go through proxy
                if (content.includes('.ts') || content.includes('.m3u8')) {
                    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                    const originalLines = content.split('\n').length;
                    
                    // Convert relative .ts URLs
                    content = content.replace(/^(?!https?:\/\/)([^#\n\r][^\n\r]*\.ts[^\n\r]*)$/gm, (match, filename) => {
                        const fullUrl = baseUrl + filename.trim();
                        const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(fullUrl)}`;
                        console.log(`    Converting TS: ${filename.trim()} -> ${proxyUrl}`);
                        return proxyUrl;
                    });
                    
                    // Convert relative .m3u8 URLs
                    content = content.replace(/^(?!https?:\/\/)([^#\n\r][^\n\r]*\.m3u8[^\n\r]*)$/gm, (match, filename) => {
                        const fullUrl = baseUrl + filename.trim();
                        const proxyUrl = `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(fullUrl)}`;
                        console.log(`    Converting M3U8: ${filename.trim()} -> ${proxyUrl}`);
                        return proxyUrl;
                    });
                    
                    const processedLines = content.split('\n').length;
                    console.log(`    Processed ${originalLines} lines -> ${processedLines} lines`);
                }
                
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
                res.send(content);
                
                console.log(`✅ M3U8 playlist processed and served: ${content.length} chars`);
                
            } else {
                console.log('>>> Detected as streaming video content - setting up stream proxy');
                
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
                    console.log(`    Forwarding Range header: ${req.headers.range}`);
                }
                
                const response = await axios({
                    method: req.method.toLowerCase(),
                    url: targetUrl,
                    responseType: 'stream',
                    timeout: 180000,
                    headers: streamHeaders
                });
                
                console.log(`Stream response:`);
                console.log(`    Status: ${response.status}`);
                console.log(`    Content-Type: ${response.headers['content-type']}`);
                console.log(`    Content-Length: ${response.headers['content-length']}`);
                console.log(`    Accept-Ranges: ${response.headers['accept-ranges']}`);
                console.log(`    Content-Range: ${response.headers['content-range']}`);
                
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
                console.log(`✅ Video stream piped successfully`);
                
                // Handle stream errors
                response.data.on('error', (error) => {
                    console.error('Stream error:', error.message);
                    if (!res.headersSent) {
                        res.status(500).send('Stream error: ' + error.message);
                    }
                });
                
                res.on('close', () => {
                    console.log('Client disconnected from stream');
                    response.data.destroy();
                });
            }
            
        } else {
            // Handle other content (images, etc.)
            console.log('>>> Handling other content as text/binary');
            
            const response = await axios({
                method: req.method.toLowerCase(),
                url: targetUrl,
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': req.headers.accept || '*/*'
                }
            });
            
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }
            
            res.send(Buffer.from(response.data));
            console.log(`✅ Other content served: ${response.data.byteLength} bytes`);
        }
        
    } catch (error) {
        console.error('\n❌ PROXY ERROR:');
        console.error(`  Message: ${error.message}`);
        console.error(`  Code: ${error.code}`);
        console.error(`  Target URL: ${targetUrl}`);
        
        if (error.response) {
            console.error(`  Response Status: ${error.response.status}`);
            console.error(`  Response Headers:`, error.response.headers);
            if (error.response.data) {
                const errorData = Buffer.isBuffer(error.response.data) 
                    ? error.response.data.toString('utf8', 0, 200)
                    : error.response.data.toString().substring(0, 200);
                console.error(`  Response Data: ${errorData}`);
            }
        }
        
        const statusCode = error.response?.status || 502;
        const errorMessage = `Proxy Error: ${error.message}`;
        
        if (!res.headersSent) {
            res.status(statusCode).json({
                error: errorMessage,
                targetUrl: targetUrl,
                timestamp: new Date().toISOString(),
                details: {
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText
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
        memory: process.memoryUsage()
    });
});

app.listen(PORT, () => {
    console.log('=================================');
    console.log('🚀 Enhanced IPTV Relay Server');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📺 Proxy endpoint: http://localhost:${PORT}/proxy?url=TARGET_URL`);
    console.log('=================================');
});
