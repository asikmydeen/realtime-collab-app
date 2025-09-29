export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.buffers = [];
    this.init();
  }
  
  init() {
    this.gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    
    if (!this.gl) {
      console.error('WebGL2 not supported');
      return false;
    }
    
    // Compile shaders
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, `
      attribute vec2 a_position;
      attribute vec4 a_color;
      uniform vec2 u_resolution;
      uniform float u_pointSize;      varying vec4 v_color;
      
      void main() {
        vec2 clipSpace = ((a_position / u_resolution) * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        gl_PointSize = u_pointSize;
        v_color = a_color;
      }
    `);
    
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec4 v_color;
      
      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        if (length(coord) > 0.5) {
          discard;
        }
        
        float alpha = 1.0 - smoothstep(0.45, 0.5, length(coord));
        gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
      }
    `);
    
    // Create program
    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);    
    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error('Failed to link program');
      return false;
    }
    
    // Get locations
    this.locations = {
      position: this.gl.getAttribLocation(this.program, 'a_position'),
      color: this.gl.getAttribLocation(this.program, 'a_color'),
      resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
      pointSize: this.gl.getUniformLocation(this.program, 'u_pointSize')
    };
    
    // Setup
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
    
    // Enable blending
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    
    // Clear to white
    this.gl.clearColor(1, 1, 1, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    
    return true;
  }
  
  compileShader(type, source) {
    const shader = this.gl.createShader(type);    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  drawLine(x1, y1, x2, y2, color, size) {
    if (!this.gl) return;
    
    const positions = [];
    const colors = [];
    
    // Parse color
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    const a = 1.0;
    
    // Generate points along the line
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const steps = Math.max(2, Math.ceil(distance / 2));
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      positions.push(        x1 + (x2 - x1) * t,
        y1 + (y2 - y1) * t
      );
      colors.push(r, g, b, a);
    }
    
    // Create buffers
    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
    
    const colorBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);
    
    // Set attributes
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.enableVertexAttribArray(this.locations.position);
    this.gl.vertexAttribPointer(this.locations.position, 2, this.gl.FLOAT, false, 0, 0);
    
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
    this.gl.enableVertexAttribArray(this.locations.color);
    this.gl.vertexAttribPointer(this.locations.color, 4, this.gl.FLOAT, false, 0, 0);
    
    // Set point size
    this.gl.uniform1f(this.locations.pointSize, size);
    
    // Draw
    this.gl.drawArrays(this.gl.POINTS, 0, positions.length / 2);
    
    // Store buffer for potential cleanup    this.buffers.push(positionBuffer, colorBuffer);
    
    // Clean up old buffers periodically
    if (this.buffers.length > 1000) {
      const toDelete = this.buffers.splice(0, 500);
      toDelete.forEach(buffer => this.gl.deleteBuffer(buffer));
    }
  }
  
  clear() {
    if (this.gl) {
      this.gl.clearColor(1, 1, 1, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }
  
  resize(width, height) {
    if (this.gl) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
      this.gl.uniform2f(this.locations.resolution, width, height);
    }
  }
  
  destroy() {
    if (this.gl) {
      this.buffers.forEach(buffer => this.gl.deleteBuffer(buffer));
      this.gl.deleteProgram(this.program);
      this.gl.getExtension('WEBGL_lose_context').loseContext();
    }
  }
}