const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('IPTV Relay Server is running. Use the /proxy endpoint.');
});

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Error: "url" query parameter is required.');
    }

    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');

        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        // Pass through content-type header from the source
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }

        response.data.pipe(res);

    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(502).send(`Error fetching the URL: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
