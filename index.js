const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('IPTV Relay Server is running. Use the /proxy endpoint.');
});

// Allow the proxy to handle any HTTP method
app.all('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Error: "url" query parameter is required.');
    }

    try {
        // More permissive CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');

        // Handle pre-flight OPTIONS requests
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        const response = await axios({
            // FIX: Use the original method from the client (GET, POST, etc.)
            method: req.method,
            url: targetUrl,
            responseType: 'stream',
            timeout: 45000, // 45 second timeout
            headers: {
                // Pass along more headers to appear like a legitimate client
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
                'Referer': req.headers['referer'] || targetUrl,
                'Origin': req.headers['origin']
            }
        });

        // Pass through important headers from the source stream
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
        // Send back the actual status code from the error if available
        const statusCode = error.response ? error.response.status : 502;
        res.status(statusCode).send(`Error fetching the URL: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
