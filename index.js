const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('IPTV Relay Server is running. Use the /proxy endpoint.');
});

app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Error: "url" query parameter is required.');
    }

    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');

        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        const response = await axios({
            method: req.method,
            url: targetUrl,
            responseType: 'stream',
            // FIX: Increased timeout to 3 minutes (180,000 ms) to match VLC's patience
            timeout: 180000, 
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': req.headers['referer'] || targetUrl
            }
        });

        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
         if (response.headers['accept-ranges']) {
            res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
        }

        response.data.pipe(res);

    } catch (error) {
        console.error('Proxy Error:', error.message);
        const statusCode = error.response ? error.response.status : 502;
        res.status(statusCode).send(`Error fetching the URL: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
