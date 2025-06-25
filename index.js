const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

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
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'text',
            timeout: 180000,
            headers: {
                'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                'Referer': 'http://localhost/'
            }
        });
        
        const content = response.data;
        
        if (content.includes('#EXTINF') || content.includes('#EXTM3U') || targetUrl.includes('m3u')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Content-Disposition', 'inline; filename="playlist.m3u"');
            res.send(content);
            console.log('M3U playlist served:', content.length, 'bytes');
        } else {
            if (response.headers['content-type']) {
                res.setHeader('Content-Type', response.headers['content-type']);
            }
            res.send(content);
        }
        
    } catch (error) {
        console.error('Proxy Error:', error.message);
        const statusCode = error.response ? error.response.status : 502;
        res.status(statusCode).send('Error fetching the URL: ' + error.message);
    }
});

app.listen(PORT, () => {
    console.log('Server is listening on port ' + PORT);
});
