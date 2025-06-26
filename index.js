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
            service: 'IPTV Live Streaming Transcoding (8-10sec fix)',
            timestamp: new Date().toISOString(),
            dependencies: 'Built-in only',
            ffmpeg_version: 'Live streaming optimized'
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
        
        console.log(`🎬 LIVE STREAMING TRANSCODING: ${targetUrl}`);
        
        try {
            // Step 1: Fetch original stream
            console.log('📡 Fetching original live stream...');
            const response = await fetchStream(targetUrl);
            
            const contentType = response.headers['content-type'] || '';
            console.log(`📊 Original Content-Type: ${contentType}`);
            
            // Step 2: Setup LIVE STREAMING headers
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            // CRITICAL: Live streaming headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('Transfer-Encoding', 'chunked');
            
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
                console.log('✅ Stream already MP4 - Direct live proxy (no transcoding)');
                res.writeHead(200);
                response.pipe(res);
                return;
            }
            
            console.log('🔄 LIVE TRANSCODING NEEDED - Starting live-optimized FFmpeg...');
            
            // Step 4: LIVE STREAMING OPTIMIZED FFmpeg parameters
            const ffmpeg = spawn('ffmpeg', [
                '-i', 'pipe:0',                    // Input from stdin
                '-y',                              // Overwrite output
                '-loglevel', 'error',              // Reduce log noise
                
                // === LIVE STREAMING CRITICAL OPTIMIZATIONS ===
                '-f', 'mp4',                       // Force MP4 container
                '-movflags', '+frag_keyframe+empty_moov+default_base_moof+faststart+live', // LIVE STREAMING!
                '-fflags', '+genpts+igndts+flush_packets+nobuffer', // Live streaming flags
                '-reset_timestamps', '1',          // Reset timestamps for live
                
                // === VIDEO ENCODING (Live Stream Optimized) ===
                '-c:v', 'libx264',                 // H.264 (universally supported)
                '-preset', 'ultrafast',            // FASTEST encoding for live
                '-tune', 'zerolatency',            // ZERO LATENCY for live streaming
                '-profile:v', 'baseline',          // Maximum compatibility
                '-level', '3.0',                   // Lower level for better support
                '-pix_fmt', 'yuv420p',            // Standard pixel format
                
                // === GOP SETTINGS FOR LIVE STREAMING ===
                '-g', '25',                        // GOP size = 1 second (25fps)
                '-keyint_min', '25',               // Minimum keyframe interval
                '-sc_threshold', '0',              // Disable scene change detection
                '-force_key_frames', 'expr:gte(t,n_forced*1)', // Force keyframe every 1 sec
                
                // === AUDIO ENCODING (ADTS → AAC Live Fix) ===
                '-c:a', 'aac',                     // Force AAC audio
                '-ar', '44100',                    // Standard sample rate
                '-ac', '2',                        // Stereo
                '-ab', '128k',                     // Audio bitrate
                '-aac_coder', 'twoloop',           // High quality AAC encoder
                '-profile:a', 'aac_low',           // AAC-LC profile (most compatible)
                
                // === LIVE STREAMING CRITICAL SETTINGS ===
                '-avoid_negative_ts', 'make_zero', // Fix timestamp issues
                '-max_delay', '0',                 // ZERO delay for live streaming
                '-max_muxing_queue_size', '1024',  // Large muxing queue for live
                '-max_interleave_delta', '0',      // No interleaving delay
                '-muxdelay', '0',                  // No mux delay
                '-muxpreload', '0',                // No mux preload
                
                // === BUFFER OPTIMIZATIONS FOR CONTINUOUS STREAMING ===
                '-flush_packets', '1',             // Flush packets immediately
                '-write_tmcd', '0',                // Don't write timecode
                
                // === LIVE STREAM QUALITY SETTINGS ===
                '-crf', '28',                      // Faster encoding (lower quality for speed)
                '-maxrate', '1M',                  // Lower maximum bitrate for stability
                '-bufsize', '2M',                  // Buffer size for rate control
                '-r', '25',                        // Fixed frame rate
                
                // === FRAGMENTATION FOR LIVE STREAMING ===
                '-fragment_time', '1',             // 1 second fragments
                '-frag_duration', '1000000',       // 1 second in microseconds
                '-min_frag_duration', '1000000',   // Minimum fragment duration
                
                // === OUTPUT ===
                '-f', 'mp4',                       // Output format
                'pipe:1'                           // Output to stdout
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Enhanced FFmpeg event handling for live streaming
            let ffmpegStarted = false;
            
            ffmpeg.on('spawn', () => {
                console.log('✅ Live streaming FFmpeg started');
                ffmpegStarted = true;
            });
            
            // Capture and analyze FFmpeg stderr for debugging
            let stderrData = '';
            ffmpeg.stderr.on('data', (data) => {
                const logLine = data.toString();
                stderrData += logLine;
                
                // Only log important info for live streaming
                if (logLine.includes('time=') && !logLine.includes('frame=')) {
                    console.log(`📊 Live FFmpeg progress: ${logLine.trim()}`);
                } else if (logLine.includes('error') || logLine.includes('Error') || logLine.includes('failed')) {
                    console.error(`❌ Live FFmpeg error: ${logLine.trim()}`);
                } else if (logLine.includes('Stream mapping:') || logLine.includes('Video:') || logLine.includes('Audio:')) {
                    console.log(`🔍 Live FFmpeg info: ${logLine.trim()}`);
                } else if (logLine.includes('frame=') && logLine.includes('fps=')) {
                    // Periodic progress logging for live streams
                    const match = logLine.match(/frame=\s*(\d+).*fps=\s*([\d.]+).*time=\s*([\d:]+)/);
                    if (match) {
                        console.log(`📺 Live: ${match[1]} frames, ${match[2]} fps, time ${match[3]}`);
                    }
                }
            });
            
            ffmpeg.on('error', (error) => {
                console.error('❌ Live FFmpeg spawn error:', error);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Live transcoding failed to start',
                        details: error.message 
                    }));
                }
            });
            
            ffmpeg.on('exit', (code, signal) => {
                console.log(`🏁 Live FFmpeg finished: code=${code}, signal=${signal}`);
                if (code !== 0 && code !== null) {
                    console.error(`❌ Live FFmpeg exited with code ${code}`);
                    console.error(`❌ Live FFmpeg stderr:`, stderrData);
                }
            });
            
            // Step 5: Enhanced live streaming pipeline
            console.log('🔄 Starting live streaming pipeline...');
            
            // First write headers
            res.writeHead(200);
            
            // Enhanced error handling for live streams
            response.on('error', (err) => {
                console.error('❌ Live source stream error:', err);
                if (ffmpegStarted) {
                    ffmpeg.stdin.destroy();
                }
            });
            
            ffmpeg.stdout.on('error', (err) => {
                console.error('❌ Live FFmpeg stdout error:', err);
                if (!res.destroyed) res.destroy();
            });
            
            ffmpeg.stdin.on('error', (err) => {
                console.error('❌ Live FFmpeg stdin error:', err);
            });
            
            // Set up the live streaming pipeline
            response.pipe(ffmpeg.stdin);
            ffmpeg.stdout.pipe(res);
            
            // Handle client disconnect gracefully for live streams
            res.on('close', () => {
                console.log('🔌 Live stream client disconnected - cleaning up FFmpeg');
                if (ffmpegStarted) {
                    ffmpeg.kill('SIGTERM');
                    setTimeout(() => {
                        if (!ffmpeg.killed) {
                            console.log('🔨 Force killing live FFmpeg');
                            ffmpeg.kill('SIGKILL');
                        }
                    }, 3000); // Shorter timeout for live streams
                }
            });
            
            req.on('close', () => {
                console.log('🔌 Live stream request closed - cleaning up FFmpeg');
                if (ffmpegStarted) {
                    ffmpeg.kill('SIGTERM');
                }
            });
            
            // Monitor FFmpeg health for live streaming
            const healthCheck = setInterval(() => {
                if (ffmpegStarted && !ffmpeg.killed) {
                    console.log('💓 Live FFmpeg health check: Running');
                } else {
                    clearInterval(healthCheck);
                }
            }, 30000); // Check every 30 seconds
            
            ffmpeg.on('exit', () => {
                clearInterval(healthCheck);
            });
            
        } catch (error) {
            console.error('❌ Live streaming proxy error:', error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'Live stream processing failed',
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
    console.log(`🚀 Live Streaming IPTV Transcoding Server running on port ${PORT}`);
    console.log(`✅ Live streaming ADTS→AAC transcoding (8-10sec fix)`);
    console.log(`✅ Zero-delay fragmented MP4 for continuous streaming`);
    console.log(`✅ Ultra-fast encoding with live stream optimizations`);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`🎬 Live Proxy: http://localhost:${PORT}/proxy?url=STREAM_URL`);
});
