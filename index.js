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
        // Detect if this is a video stream vs M3U playlist
        const isM3URequest = targetUrl.includes('m3u') || 
                           targetUrl.includes('get.php') || 
                           targetUrl.includes('playlist') ||
                           targetUrl.includes('type=m3u');
        
        const isVideoStream = !isM3URequest && (
            targetUrl.match(/\/\d+$/) ||           // ends with numbers
            targetUrl.includes('/live/') ||        // contains /live/
            targetUrl.includes('.ts') ||           // TS stream
            targetUrl.includes('.m3u8')            // M3U8 stream
        );
        
        console.log(`Request type: ${isM3URequest ? 'M3U' : isVideoStream ? 'Video Stream' : 'Other'} for ${targetUrl}`);
        
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
            
        } else if (isVideoStream) {
            // Handle video streams with streaming
            console.log('Streaming video content...');
            const response = await axios({
                method: 'get',
                url: targetUrl,
                responseType: 'stream',
                timeout: 180000,
                headers: {
                    'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                    'Referer': 'http://localhost/',
                    'Accept': '*/*',
                    'Connection': 'keep-alive'
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
            
            // Pipe the stream
            response.data.pipe(res);
            console.log('Video stream piped successfully');
            
        } else {
            // Handle other content as text
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
        const statusCode = error.response ? error.response.status : 502;
        res.status(statusCode).send('Error fetching the URL: ' + error.message);
    }
});

app.listen(PORT, () => {
    console.log('Server is listening on port ' + PORT);
});
