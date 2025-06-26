const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const app = express();

// CORS setup for IPTV player
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['*']
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'IPTV ADTS→AAC Transcoding',
        timestamp: new Date().toISOString()
    });
});

// Main proxy endpoint with FFmpeg transcoding
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'URL parameter required' });
    }

    console.log(`🎬 TRANSCODING REQUEST: ${targetUrl}`);
    
    try {
        // Step 1: Fetch original stream
        console.log('📡 Fetching original stream...');
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            },
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`Stream fetch failed: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        console.log(`📊 Original Content-Type: ${contentType}`);

        // Step 2: Setup browser-compatible response headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        // Step 3: Detect if transcoding needed
        const needsTranscoding = (
            contentType.includes('mp2t') ||           // MPEG-TS streams
            contentType.includes('adts') ||           // ADTS audio streams  
            contentType.includes('application/octet-stream') || // Unknown binary
            targetUrl.includes('.ts') ||              // .ts files
            !contentType.includes('mp4')              // Non-MP4 formats
        );

        if (!needsTranscoding && contentType.includes('mp4')) {
            console.log('✅ Stream already MP4 - Direct proxy (no transcoding)');
            response.body.pipe(res);
            return;
        }

        console.log('🔄 TRANSCODING NEEDED - Starting FFmpeg with browser-compatible params...');
        
        // Step 4: FFmpeg transcoding with CORRECT parameters
        const ffmpeg = spawn('ffmpeg', [
            '-i', 'pipe:0',                    // Input from stdin
            '-y',                              // Overwrite output
            
            // === BROWSER COMPATIBILITY PARAMETERS ===
            '-f', 'mp4',                       // Force MP4 container
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof', // Streaming MP4
            '-fflags', '+genpts+igndts',       // Generate proper timestamps
            
            // === VIDEO ENCODING ===
            '-c:v', 'libx264',                 // H.264 video codec
            '-preset', 'ultrafast',            // Fast encoding for live streams
            '-tune', 'zerolatency',            // Low latency for IPTV
            '-profile:v', 'baseline',          // Maximum browser compatibility
            '-level', '3.1',                   // Broad device support
            '-pix_fmt', 'yuv420p',            // Standard pixel format
            '-r', '25',                        // Standard frame rate
            
            // === AUDIO ENCODING (ADTS → AAC FIX) ===
            '-c:a', 'aac',                     // Force AAC audio codec
            '-ar', '48000',                    // 48kHz sample rate
            '-ac', '2',                        // Stereo audio
            '-ab', '128k',                     // 128kbps audio bitrate
            '-aac_coder', 'twoloop',           // High quality AAC encoder
            
            // === STREAMING OPTIMIZATIONS ===
            '-avoid_negative_ts', 'make_zero', // Fix timestamp issues
            '-max_delay', '1000000',           // 1 second max delay
            '-max_muxing_queue_size', '1024',  // Large muxing queue
            '-thread_queue_size', '512',       // Threading optimization
            
            // === OUTPUT ===
            '-f', 'mp4',                       // Output format
            'pipe:1'                           // Output to stdout
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Handle FFmpeg events
        ffmpeg.on('spawn', () => {
            console.log('✅ FFmpeg transcoding started successfully');
        });

        ffmpeg.stderr.on('data', (data) => {
            const logLine = data.toString();
            if (logLine.includes('frame=') || logLine.includes('time=')) {
                console.log(`📊 FFmpeg: ${logLine.trim()}`);
            } else if (logLine.includes('error') || logLine.includes('Error')) {
                console.error(`❌ FFmpeg error: ${logLine.trim()}`);
            }
        });

        ffmpeg.on('error', (error) => {
            console.error('❌ FFmpeg spawn error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Transcoding failed to start' });
            }
        });

        ffmpeg.on('exit', (code, signal) => {
            console.log(`🏁 FFmpeg finished: code=${code}, signal=${signal}`);
            if (code !== 0 && code !== null) {
                console.error(`❌ FFmpeg exited with code ${code}`);
            }
        });

        // Step 5: Pipe stream through FFmpeg
        console.log('🔄 Piping stream: Original → FFmpeg → Browser');
        response.body.pipe(ffmpeg.stdin);
        ffmpeg.stdout.pipe(res);

        // Handle client disconnect
        res.on('close', () => {
            console.log('🔌 Client disconnected - stopping FFmpeg');
            ffmpeg.kill('SIGTERM');
        });

        req.on('close', () => {
            console.log('🔌 Request closed - stopping FFmpeg');  
            ffmpeg.kill('SIGTERM');
        });

    } catch (error) {
        console.error('❌ Proxy error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Stream processing failed',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 IPTV Transcoding Server running on port ${PORT}`);
    console.log(`✅ ADTS→AAC transcoding with browser-compatible FFmpeg parameters`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`🎬 Proxy: http://localhost:${PORT}/proxy?url=STREAM_URL`);
});
