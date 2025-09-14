// Constants
const HANDLE_SIZE = 20;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

// State variables
let lines = [];
let isDrawing = false;
let isPanning = false;
let resizeHandle = null;
let zoom = 1;
let panOffset = { x: 0, y: 0 };
let lastPanPoint = null;
let currentLine = null;
let hoveredHandle = null;

// DOM elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const zoomIndicator = document.getElementById('zoom-indicator');

// Initialize canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawCanvas();
}

// Reset view function
function resetView() {
    zoom = 1;
    panOffset = { x: 0, y: 0 };
    updateZoomIndicator();
    drawCanvas();
}

// Update zoom indicator text
function updateZoomIndicator() {
    zoomIndicator.textContent = `${Math.round(zoom * 2) / 2}x`;
}

// Convert screen coordinates to canvas coordinates
function getCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - panOffset.x) / zoom;
    const y = (clientY - rect.top - panOffset.y) / zoom;
    return { x, y };
}

// Check if point is near a line handle
function getClickedHandle(point) {
    const handleRadius = HANDLE_SIZE / zoom;
    
    for (const line of lines) {
        const startDistance = Math.sqrt((point.x - line.start.x) ** 2 + (point.y - line.start.y) ** 2);
        const endDistance = Math.sqrt((point.x - line.end.x) ** 2 + (point.y - line.end.y) ** 2);
        
        if (startDistance <= handleRadius) {
            return { lineId: line.id, handle: 'start' };
        }
        if (endDistance <= handleRadius) {
            return { lineId: line.id, handle: 'end' };
        }
    }
    return null;
}

// Update cursor based on current state
function updateCursor() {
    canvas.className = '';
    if (hoveredHandle) {
        canvas.classList.add('pointer');
    } else if (isPanning) {
        canvas.classList.add('panning');
    }
    // Default crosshair cursor is set in CSS
}

// Main drawing function
function drawCanvas() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply zoom and pan
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);
    
    // Draw grid
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5 / zoom;
    const gridSize = 20;
    const startX = Math.floor(-panOffset.x / zoom / gridSize) * gridSize;
    const startY = Math.floor(-panOffset.y / zoom / gridSize) * gridSize;
    const endX = startX + (canvas.width / zoom) + gridSize;
    const endY = startY + (canvas.height / zoom) + gridSize;
    
    // Draw vertical grid lines
    for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
    }
    
    // Draw horizontal grid lines
    for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
    }
    
    // Draw all lines
    const allLines = [...lines];
    if (currentLine) {
        allLines.push(currentLine);
    }
    
    allLines.forEach((line) => {
        if (!line) return;
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2 / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
        
        // Draw handles when hovered
        if (hoveredHandle && hoveredHandle.lineId === line.id) {
            ctx.fillStyle = '#3B82F6';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1 / zoom;
            
            const handleRadius = 6 / zoom;
            
            if (hoveredHandle.handle === 'start') {
                ctx.beginPath();
                ctx.arc(line.start.x, line.start.y, handleRadius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(line.end.x, line.end.y, handleRadius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            }
        }
    });
    
    ctx.restore();
}

// Mouse event handlers
function handleMouseDown(e) {
    const point = getCanvasPoint(e.clientX, e.clientY);
    
    // Check if clicking on a handle
    const clickedHandle = getClickedHandle(point);
    if (clickedHandle) {
        resizeHandle = clickedHandle;
        return;
    }
    
    // Check if we should pan (right click or ctrl/cmd+click)
    if (e.button === 2 || e.ctrlKey || e.metaKey) {
        isPanning = true;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        updateCursor();
        return;
    }
    
    // Start drawing a new line
    const newLine = {
        id: Date.now().toString(),
        start: point,
        end: point,
    };
    currentLine = newLine;
    isDrawing = true;
}

function handleMouseMove(e) {
    const point = getCanvasPoint(e.clientX, e.clientY);
    
    if (isDrawing && currentLine) {
        currentLine.end = point;
        drawCanvas();
    } else if (isPanning && lastPanPoint) {
        const deltaX = e.clientX - lastPanPoint.x;
        const deltaY = e.clientY - lastPanPoint.y;
        panOffset.x += deltaX;
        panOffset.y += deltaY;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        drawCanvas();
    } else if (resizeHandle) {
        const lineIndex = lines.findIndex(line => line.id === resizeHandle.lineId);
        if (lineIndex !== -1) {
            lines[lineIndex][resizeHandle.handle] = point;
            drawCanvas();
        }
    } else {
        // Check if hovering over a handle
        const newHoveredHandle = getClickedHandle(point);
        if (newHoveredHandle !== hoveredHandle) {
            hoveredHandle = newHoveredHandle;
            updateCursor();
            drawCanvas();
        }
    }
}

function handleMouseUp() {
    if (isDrawing && currentLine) {
        lines.push(currentLine);
        currentLine = null;
    }
    isDrawing = false;
    isPanning = false;
    lastPanPoint = null;
    resizeHandle = null;
    updateCursor();
}

function handleWheel(e) {
    e.preventDefault();
    const point = getCanvasPoint(e.clientX, e.clientY);
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));
    
    if (newZoom !== zoom) {
        const zoomChange = newZoom - zoom;
        panOffset.x -= point.x * zoomChange;
        panOffset.y -= point.y * zoomChange;
        zoom = newZoom;
        updateZoomIndicator();
        drawCanvas();
    }
}

// Event listeners
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mouseleave', handleMouseUp);
canvas.addEventListener('wheel', handleWheel);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

zoomIndicator.addEventListener('click', resetView);

window.addEventListener('resize', resizeCanvas);

// Initialize
resizeCanvas();
updateZoomIndicator();