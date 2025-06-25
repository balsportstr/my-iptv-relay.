const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Global CORS middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
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
        // Check if this is likely an M3U playlist request
        const isM3URequest = targetUrl.includes('m3u') || 
                           targetUrl.includes('get.php') || 
                           targetUrl.includes('playlist') ||
                           targetUrl.includes('type=m3u');
        
        let responseType = 'stream';
        if (isM3URequest) {
            responseType = 'text'; // Get as text first to check content
        }
        
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: responseType,
            timeout: 180000, // 3 minute timeout
            headers: {
                'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                'Referer': 'http://localhost/'
            }
        });
        
        // Handle M3U content specifically
        if (isM3URequest || (typeof response.data === 'string' && (response.data.includes('#EXTINF') || response.data.includes('#EXTM3U')))) {
            // This is M3U content - set proper headers
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
            res.send(response.data);
            console.log(`✅ M3U playlist served: ${response.data.length} bytes`);
        } else {
            // Regular streaming content - pipe as before
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            if (response.headers['content-length']) {
                res.setHeader('Content-Length', response.headers['content-length']);
            }
            if (response.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
            }
            
            // For streaming content, need to re-fetch as stream
            if (responseType === 'text') {
                const streamResponse = await axios({
                    method: 'get',
                    url: targetUrl,
                    responseType: 'stream',
                    timeout: 180000,
                    headers: {
                        'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                        'Referer': 'http://localhost/'
                    }
                });
                streamResponse.data.pipe(res);
            } else {
                response.data.pipe(res);
            }
        }
        
    } catch (error) {
        console.error('Proxy Error:', error.message);
        const statusCode = error.response ? error.response.status : 502;
        res.status(statusCode).send(`Error fetching the URL: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
