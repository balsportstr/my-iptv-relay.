const http = require('http');
const https = require('https');
const url = require('url');
const { spawn } = require('child_process');

// CORS headers helper
function setCORSHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// Simple fetch function using built-in modules
function fetchStream(targetUrl) {
    return new Promise((resolve, reject) => {
        const isHttps = targetUrl.startsWith('https:');
        const client = isHttps ? https : http;
        
        const options = {
            headers: {
                'User-Agent': 'VLC/3.0.17.4 LibVLC/3.0.17.4',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            },
            timeout: 10000
        };
        
        const req = client.get(targetUrl, options, (response) => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                resolve(response);
            } else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Handle redirects
                fetchStream(response.headers.location).then(resolve).catch(reject);
            } else {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            }
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    // Set CORS headers for all requests
    setCORSHeaders(res);
    
    // Handle OPTIONS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Health check endpoint
    if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'OK',
            service: 'IPTV ADTS→AAC Transcoding (Browser Optimized)',
            timestamp: new Date().toISOString(),
            dependencies: 'Built-in only',
            ffmpeg_version: 'Browser optimized parameters'
        }));
        return;
    }
    
    // Main proxy endpoint
    if (pathname === '/proxy') {
        const targetUrl = query.url;
        
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'URL parameter required' }));
            return;
        }
        
        console.log(`🎬 BROWSER-OPTIMIZED TRANSCODING: ${targetUrl}`);
        
        try {
            // Step 1: Fetch original stream
            console.log('📡 Fetching original stream...');
            const response = await fetchStream(targetUrl);
            
            const contentType = response.headers['content-type'] || '';
            console.log(`📊 Original Content-Type: ${contentType}`);
            
            // Step 2: Setup ENHANCED browser-compatible headers
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            // CRITICAL: Additional headers for browser video streaming
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', 'inline');
            
            // Step 3: Enhanced transcoding detection
            const needsTranscoding = (
                contentType.includes('mp2t') ||           
                contentType.includes('adts') ||           
                contentType.includes('application/octet-stream') ||
                targetUrl.includes('.ts') ||              
                !contentType.includes('mp4') ||
                contentType.includes('video/x-flv') ||    // FLV streams
                contentType.includes('video/quicktime')   // MOV streams
            );
            
            if (!needsTranscoding && contentType.includes('mp4')) {
                console.log('✅ Stream already MP4 - Direct proxy (no transcoding)');
                res.writeHead(200);
                response.pipe(res);
                return;
            }
            
            console.log('🔄 TRANSCODING NEEDED - Browser-optimized FFmpeg starting...');
            
            // Step 4: BROWSER-OPTIMIZED FFmpeg parameters
            const ffmpeg = spawn('ffmpeg', [
                '-i', 'pipe:0',                    // Input from stdin
                '-y',                              // Overwrite output
                '-loglevel', 'error',              // Reduce log noise
                
                // === CRITICAL BROWSER OPTIMIZATIONS ===
                '-f', 'mp4',                       // Force MP4 container
                '-movflags', '+frag_keyframe+empty_moov+default_base_moof+faststart', // CRITICAL: Streaming MP4
                '-fflags', '+genpts+igndts+flush_packets', // Enhanced timestamp handling
                
                // === VIDEO ENCODING (Browser Compatible) ===
                '-c:v', 'libx264',                 // H.264 (universally supported)
                '-preset', 'veryfast',             // Faster than ultrafast, better quality
                '-tune', 'zerolatency',            // Real-time streaming
                '-profile:v', 'baseline',          // Maximum compatibility
                '-level', '3.0',                   // Lower level for better support
                '-pix_fmt', 'yuv420p',            // Standard pixel format
                '-g', '30',                        // GOP size (keyframe interval)
                '-keyint_min', '30',               // Minimum keyframe interval
                '-sc_threshold', '0',              // Disable scene change detection
                
                // === AUDIO ENCODING (ADTS → AAC Browser Fix) ===
                '-c:a', 'aac',                     // Force AAC audio
                '-ar', '44100',                    // Standard sample rate (more compatible than 48kHz)
                '-ac', '2',                        // Stereo
                '-ab', '128k',                     // Audio bitrate
                '-aac_coder', 'twoloop',           // High quality AAC encoder
                '-profile:a', 'aac_low',           // AAC-LC profile (most compatible)
                
                // === STREAMING OPTIMIZATIONS ===
                '-avoid_negative_ts', 'make_zero', // Fix timestamp issues
                '-max_delay', '500000',            // 0.5 second max delay (reduced)
                '-max_muxing_queue_size', '9999',  // Large muxing queue
                '-max_interleave_delta', '0',      // No interleaving delay
                
                // === BUFFER OPTIMIZATIONS ===
                '-buffer_size', '64k',             // Small buffer for low latency
                '-flush_packets', '1',             // Flush packets immediately
                
                // === VIDEO QUALITY OPTIMIZATIONS ===
                '-crf', '23',                      // Good quality balance
                '-maxrate', '2M',                  // Maximum bitrate limit
                '-bufsize', '4M',                  // Buffer size for rate control
                
                // === OUTPUT ===
                '-f', 'mp4',                       // Output format
                'pipe:1'                           // Output to stdout
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Enhanced FFmpeg event handling
            let ffmpegStarted = false;
            
            ffmpeg.on('spawn', () => {
                console.log('✅ Browser-optimized FFmpeg started');
                ffmpegStarted = true;
            });
            
            // Capture and analyze FFmpeg stderr for debugging
            let stderrData = '';
            ffmpeg.stderr.on('data', (data) => {
                const logLine = data.toString();
                stderrData += logLine;
                
                // Only log important info, not every frame
                if (logLine.includes('time=') && !logLine.includes('frame=')) {
                    console.log(`📊 FFmpeg progress: ${logLine.trim()}`);
                } else if (logLine.includes('error') || logLine.includes('Error') || logLine.includes('failed')) {
                    console.error(`❌ FFmpeg error: ${logLine.trim()}`);
                } else if (logLine.includes('Stream mapping:') || logLine.includes('Video:') || logLine.includes('Audio:')) {
                    console.log(`🔍 FFmpeg info: ${logLine.trim()}`);
                }
            });
            
            ffmpeg.on('error', (error) => {
                console.error('❌ FFmpeg spawn error:', error);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Transcoding failed to start',
                        details: error.message 
                    }));
                }
            });
            
            ffmpeg.on('exit', (code, signal) => {
                console.log(`🏁 FFmpeg finished: code=${code}, signal=${signal}`);
                if (code !== 0 && code !== null) {
                    console.error(`❌ FFmpeg exited with code ${code}`);
                    console.error(`❌ FFmpeg stderr:`, stderrData);
                }
            });
            
            // Step 5: Enhanced streaming pipeline
            console.log('🔄 Starting enhanced streaming pipeline...');
            
            // First write headers
            res.writeHead(200);
            
            // Pipe with error handling
            response.on('error', (err) => {
                console.error('❌ Source stream error:', err);
                ffmpeg.stdin.destroy();
            });
            
            ffmpeg.stdout.on('error', (err) => {
                console.error('❌ FFmpeg stdout error:', err);
                if (!res.destroyed) res.destroy();
            });
            
            ffmpeg.stdin.on('error', (err) => {
                console.error('❌ FFmpeg stdin error:', err);
            });
            
            // Set up the pipeline
            response.pipe(ffmpeg.stdin);
            ffmpeg.stdout.pipe(res);
            
            // Handle client disconnect gracefully
            res.on('close', () => {
                console.log('🔌 Client disconnected - cleaning up FFmpeg');
                if (ffmpegStarted) {
                    ffmpeg.kill('SIGTERM');
                    setTimeout(() => {
                        if (!ffmpeg.killed) {
                            console.log('🔨 Force killing FFmpeg');
                            ffmpeg.kill('SIGKILL');
                        }
                    }, 5000);
                }
            });
            
            req.on('close', () => {
                console.log('🔌 Request closed - cleaning up FFmpeg');
                if (ffmpegStarted) {
                    ffmpeg.kill('SIGTERM');
                }
            });
            
        } catch (error) {
            console.error('❌ Proxy error:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'Stream processing failed',
                    details: error.message,
                    timestamp: new Date().toISOString()
                }));
            }
        }
        return;
    }
    
    // 404 for other paths
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        error: 'Not found',
        available_endpoints: ['/health', '/proxy?url=STREAM_URL']
    }));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Browser-Optimized IPTV Transcoding Server running on port ${PORT}`);
    console.log(`✅ Enhanced ADTS→AAC transcoding with browser-optimized parameters`);
    console.log(`✅ Fragmented MP4 + streaming headers for maximum compatibility`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`🎬 Proxy: http://localhost:${PORT}/proxy?url=STREAM_URL`);
});
