const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Cache-Control');
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
    
    try {
        // Enhanced detection for different content types
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
        
        const isDirectVideoFile = targetUrl.match(/\.(mp4|mkv|avi|mov|ts)$/);
        const isM3U8File = targetUrl.includes('.m3u8');
        
        console.log(`Request type: ${
            isM3URequest ? 'M3U Playlist' : 
            isXtreamStream ? 'Xtream Stream' : 
            isM3U8File ? 'M3U8 File' :
            isDirectVideoFile ? 'Direct Video' : 'Other'
        } for ${targetUrl}`);
        
        if (isM3URequest) {
            // Handle M3U playlists as text
            const response = await axios({
                method: 'get',
                url: targetUrl,
                responseType: 'text',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/'
                }
            });
            
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
            res.send(response.data);
            console.log('M3U playlist served:', response.data.length, 'bytes');
            
        } else if (isXtreamStream || isM3U8File) {
            // Handle Xtream streams - these might be M3U8 or direct streams
            console.log('Handling Xtream stream or M3U8...');
            
            // First, check what this URL returns
            const headResponse = await axios({
                method: 'head',
                url: targetUrl,
                timeout: 30000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': '*/*'
                }
            });
            
            const contentType = headResponse.headers['content-type'] || '';
            console.log('Detected content type:', contentType);
            
            // Check if it's actually a playlist by getting first few bytes
            const sampleResponse = await axios({
                method: 'get',
                url: targetUrl,
                timeout: 30000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': '*/*',
                    'Range': 'bytes=0-1023' // Only first 1KB to check format
                }
            });
            
            const sampleContent = sampleResponse.data.toString();
            console.log('Sample content:', sampleContent.substring(0, 200));
            
            // If it's a playlist, handle as text
            if (sampleContent.includes('#EXTM3U') || sampleContent.includes('.m3u8') || 
                contentType.includes('mpegurl') || contentType.includes('m3u')) {
                
                console.log('Detected as M3U8 playlist, serving as text...');
                
                // Get full playlist content
                const fullResponse = await axios({
                    method: 'get',
                    url: targetUrl,
                    responseType: 'text',
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                        'Referer': 'http://localhost/'
                    }
                });
                
                let content = fullResponse.data;
                
                // Process relative URLs in M3U8
                if (content.includes('.ts') || content.includes('.m3u8')) {
                    const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                    
                    // Convert relative URLs to absolute URLs through proxy
                    content = content.replace(/^(?!https?:\/\/)(.+\.ts)$/gm, (match, filename) => {
                        const fullUrl = baseUrl + filename;
                        return `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(fullUrl)}`;
                    });
                    
                    content = content.replace(/^(?!https?:\/\/)(.+\.m3u8)$/gm, (match, filename) => {
                        const fullUrl = baseUrl + filename;
                        return `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(fullUrl)}`;
                    });
                }
                
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Cache-Control', 'no-cache');
                res.send(content);
                console.log('M3U8 playlist processed and served');
                
            } else {
                // Handle as streaming video content
                console.log('Detected as streaming video, piping...');
                
                const response = await axios({
                    method: 'get',
                    url: targetUrl,
                    responseType: 'stream',
                    timeout: 180000,
                    headers: {
                        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                        'Referer': 'http://localhost/',
                        'Accept': '*/*',
                        'Connection': 'keep-alive',
                        // Forward range header if present
                        'Range': req.headers.range || undefined
                    }
                });
                
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
                
                // Pipe the stream
                response.data.pipe(res);
                console.log('Video stream piped successfully');
            }
            
        } else {
            // Handle other content as before
            const response = await axios({
                method: 'get',
                url: targetUrl,
                responseType: 'text',
                timeout: 60000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/'
                }
            });
            
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            res.send(response.data);
        }
        
    } catch (error) {
        console.error('Proxy Error:', error.message);
        console.error('Target URL:', targetUrl);
        console.error('Error details:', {
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data?.toString().substring(0, 200)
        });
        
        const statusCode = error.response ? error.response.status : 502;
        res.status(statusCode).send('Error fetching the URL: ' + error.message);
    }
});

app.listen(PORT, () => {
    console.log('Server is listening on port ' + PORT);
});
