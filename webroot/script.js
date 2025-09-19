// Import GeoJSON data
import { geoJson, algiersCapital } from './geoData.js';
import { landmarks } from './landmarks.js';

// Global variables
let canvas, ctx;
let lines = [];
let isDrawing = false;
let slicedLines = []; // Track lines that have been sliced
let isPanning = false;
let resizeHandle = null;
let zoom = 1;
let panOffset = { x: 0, y: 0 };
let lastPanPoint = null;
let currentLine = null;
let hoveredHandle = null;
let geoScale = 1;
let geoTranslateX = 0;
let geoTranslateY = 0;
let regions = [];
let originalRegion = null;
const colorPalette = ['#8B4513', '#4CAF50', '#2196F3', '#FF5722', '#9C27B0', '#E91E63', '#FFC107', '#00BCD4'];
let nextColorIndex = 0;
let submitButton = null;
let hoveredLandmark = null;
let tooltip = null;
let draggingCapitalId = null;

// Game state
let isGameOver = false;

// Scoring variables
let maxScore = 0;
let playerScore = 0;

// Line length tracking variables
let maxLength = 0;
let usedLineLength = 0; // Track total length of applied slices

// Touch interaction variables
let isPinching = false;
let initialPinchDistance = 0;
let initialPinchCenterScreen = null;
let initialPinchZoom = 1;
let initialPinchPanOffset = { x: 0, y: 0 };

// Constants
const HANDLE_SIZE = 20;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 10;
let mapBounds = null;

// Initialize the application
function init() {
    // Show loading screen initially (it's already visible)
    
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    // Set up canvas size
    resizeCanvas();
    
    // Calculate GeoJSON transformation
    calculateGeoTransform();
    
    // Calculate maximum allowed line length
    calculateMaxLength();
    
    // Initialize the first region
    if (geoJson && geoJson.coordinates && geoJson.coordinates[0]) {
        const points = geoJson.coordinates[0].map(([lon, lat]) => mapGeoToCanvas(lon, lat));
        const initialRegion = {
            id: generateId(),
            points: points,
            color: colorPalette[nextColorIndex]
        };
        nextColorIndex = (nextColorIndex + 1) % colorPalette.length;
        regions.push(initialRegion);
        
        // Store original region for resetting
        originalRegion = {
            id: initialRegion.id,
            points: [...points],
            color: colorPalette[0]
        };
    }
    
    // Event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    
    // Touch event listeners for mobile
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);
    
    window.addEventListener('resize', resizeCanvas);
    
    // Zoom indicator click
    document.getElementById('zoom-indicator').addEventListener('click', resetView);
    
    // Get submit button reference
    submitButton = document.getElementById('submit-btn');
    
    // Get clear button reference and add event listener
    const clearButton = document.getElementById('clear-btn');
    clearButton.addEventListener('click', clearMap);
    
    // Get reset button reference and add event listener
    const resetButton = document.getElementById('reset-btn');
    resetButton.addEventListener('click', resetMap);
    
    // Get play again button reference and add event listener
    const playAgainButton = document.getElementById('play-again-btn');
    playAgainButton.addEventListener('click', restartGame);
    
    // Initialize scoring
    calculateAndUpdateScores();
    
    // Initialize health bar display
    updateHealthBarDisplay();
    
    // Create tooltip element
    createTooltip();
    
    // Submit button click
    submitButton.addEventListener('click', () => {
        if (lines.length === 0) return;
        
        // Get the last (most recent) line
        const lineToSlice = lines[lines.length - 1];
        
        // Check if this line is legal
        if (isLineLegal(lineToSlice)) {
            // Calculate the slicing length BEFORE applying
            const lineLength = calculateSlicingLength(lineToSlice);
            
            // Check if applying this line would exceed the limit
            if (usedLineLength + lineLength > maxLength) {
                console.log('Game over - line would exceed limit!');
                
                // Remove the line that would exceed the limit
                lines.pop();
                
                // Clear current line and reset drawing state
                currentLine = null;
                
                // Update displays
                updateSubmitButtonState();
                updateHealthBarDisplay();
                
                // Trigger game over
                isGameOver = true;
                showGameOverScreen();
                
                // Redraw canvas
                drawCanvas();
                return;
            }
            
            console.log('Slice applied!');
            
            // Add the slicing length to used length
            usedLineLength += lineLength;
            
            // Apply the territorial split
            splitRegionsWithLine(lineToSlice);
            
            // Remove the sliced line
            lines.pop();
        } else {
            console.log('Cannot slice - line intersects stronghold!');
            
            // Remove the illegal line without counting it against life
            lines.pop();
        }
        
        // Clear current line and reset drawing state
        currentLine = null;
        
        // Update submit button state
        updateSubmitButtonState();
        
        // Update health bar display
        updateHealthBarDisplay();
        
        // Check for game over after slicing
        checkGameOver();
        
        // Redraw canvas to show the slice result and updated stronghold
        drawCanvas();
    });
    
    // Initialize submit button state
    updateSubmitButtonState();
    
    // Initial draw
    resetView(); // Ensure map is visible on initial load
    drawCanvas();
    
    // Hide loading screen once everything is ready
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
    }, 500); // Small delay to ensure smooth loading experience
}

// Utility functions
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function getPolygonCentroid(points) {
    let x = 0, y = 0;
    points.forEach(point => {
        x += point.x;
        y += point.y;
    });
    return {
        x: x / points.length,
        y: y / points.length
    };
}

function updateSubmitButtonState() {
    if (submitButton) {
        submitButton.disabled = !(lines.length > 0 && isLineLegal(lines[lines.length - 1]));
    }
}

function calculateAndUpdateScores() {
    // Calculate total area of all regions
    const totalArea = regions.reduce((sum, region) => {
        return sum + calculatePolygonArea(region.points);
    }, 0);
    
    // Calculate max possible score
    // 5 points per percentage of area + 50 points per landmark
    const maxAreaPoints = 100 * 5; // 100% * 5 points per %
    const maxLandmarkPoints = landmarks.length * 50;
    maxScore = maxAreaPoints + maxLandmarkPoints;
    
    // Calculate player score
    let playerAreaPoints = 0;
    let playerLandmarkPoints = 0;
    
    // Calculate area percentage of green regions
    const greenArea = regions.reduce((sum, region) => {
        if (region.color === '#4CAF50') { // Green regions
            return sum + calculatePolygonArea(region.points);
        }
        return sum;
    }, 0);
    
    if (totalArea > 0) {
        const areaPercentage = (greenArea / totalArea) * 100;
        playerAreaPoints = Math.round(areaPercentage * 5);
    }
    
    // Calculate landmark points (landmarks in green regions)
    playerLandmarkPoints = landmarks.reduce((count, landmark) => {
        const landmarkPoint = mapGeoToCanvas(landmark.longitude, landmark.latitude);
        
        // Check if landmark is in any green region
        for (const region of regions) {
            if (region.color === '#4CAF50' && isPointInPolygon(landmarkPoint, region.points)) {
                return count + 50;
            }
        }
        return count;
    }, 0);
    
    playerScore = playerAreaPoints + playerLandmarkPoints;
    
    // Update DOM elements
    const maxScoreElement = document.getElementById('max-score');
    const playerScoreElement = document.getElementById('player-score');
    
    if (maxScoreElement) {
        maxScoreElement.textContent = `Max: ${maxScore}`;
    }
    
    if (playerScoreElement) {
        playerScoreElement.textContent = `Score: ${playerScore}`;
    }
    window.parent.postMessage(
        {
            type: 'setHighScore',
            data: { highScore: playerScore },
        },
        '*'
    );
}

function calculateGeoTransform() {
    if (!geoJson || !geoJson.coordinates || !geoJson.coordinates[0]) return;
    
    const coords = geoJson.coordinates[0];
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    
    // Find bounds of the GeoJSON
    coords.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
    });
    
    // Store map bounds for constraint calculations
    mapBounds = {
        minLon, maxLon, minLat, maxLat,
        width: maxLon - minLon,
        height: maxLat - minLat
    };
    
    const geoWidth = maxLon - minLon;
    const geoHeight = maxLat - minLat;
    
    // Calculate scale to fit 80% of canvas
    const canvasWidth = window.innerWidth * 0.8;
    const canvasHeight = window.innerHeight * 0.8;
    const scaleX = canvasWidth / geoWidth;
    const scaleY = canvasHeight / geoHeight;
    geoScale = Math.min(scaleX, scaleY);
    
    // Calculate translation to center the map
    const scaledGeoWidth = geoWidth * geoScale;
    const scaledGeoHeight = geoHeight * geoScale;
    geoTranslateX = (window.innerWidth - scaledGeoWidth) / 2 - (minLon * geoScale);
    geoTranslateY = (window.innerHeight - scaledGeoHeight) / 2 + (maxLat * geoScale);
}

function getGeoDistance(lon1, lat1, lon2, lat2) {
    // Calculate Euclidean distance between two geographic points
    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    return Math.sqrt(dx * dx + dy * dy);
}

function mapCanvasToGeo(x, y) {
    // Convert canvas coordinates back to longitude/latitude
    const longitude = (x - geoTranslateX) / geoScale;
    const latitude = -(y - geoTranslateY) / geoScale;
    return { longitude, latitude };
}

function calculateMaxLength() {
    if (!geoJson || !geoJson.coordinates || !geoJson.coordinates[0]) {
        maxLength = 1200; // fallback
        return;
    }
    
    const coords = geoJson.coordinates[0];
    let minLon = Infinity, maxLon = -Infinity;
    let leftmostPoint = null, rightmostPoint = null;
    
    // Find leftmost and rightmost points
    coords.forEach(([lon, lat]) => {
        if (lon < minLon) {
            minLon = lon;
            leftmostPoint = { longitude: lon, latitude: lat };
        }
        if (lon > maxLon) {
            maxLon = lon;
            rightmostPoint = { longitude: lon, latitude: lat };
        }
    });
    
    if (leftmostPoint && rightmostPoint) {
        // Calculate distance between leftmost and rightmost points
        const mapWidth = getGeoDistance(
            leftmostPoint.longitude, leftmostPoint.latitude,
            rightmostPoint.longitude, rightmostPoint.latitude
        );
        
        // Set max length to 2x the map width
        maxLength = 1.7 * mapWidth;
    } else {
        maxLength = 1200; // fallback
    }
    
    // Update health bar display
    updateHealthBarDisplay();
}

function calculateTotalLineLength() {
    let totalLineLength = 0;
    
    lines.forEach(line => {
        const length = calculateLineLength(line);
        totalLineLength += length;
    });
    
    return totalLineLength;
}

function calculateLineLength(line) {
    // Convert to base coordinates (without zoom/pan)
    const baseStartX = (line.start.x * zoom + panOffset.x - panOffset.x) / zoom;
    const baseStartY = (line.start.y * zoom + panOffset.y - panOffset.y) / zoom;
    const baseEndX = (line.end.x * zoom + panOffset.x - panOffset.x) / zoom;
    const baseEndY = (line.end.y * zoom + panOffset.y - panOffset.y) / zoom;
    
    // Convert canvas coordinates to geographic coordinates
    const startGeo = mapCanvasToGeo(baseStartX, baseStartY);
    const endGeo = mapCanvasToGeo(baseEndX, baseEndY);
    
    // Calculate distance in geographic units
    return getGeoDistance(
        startGeo.longitude, startGeo.latitude,
        endGeo.longitude, endGeo.latitude
    );
}

function calculateSlicingLength(line) {
    let totalSlicingLength = 0;
    
    // For each region, calculate the length of line segments that pass through it
    regions.forEach(region => {
        const intersections = lineIntersectsPolygon(line, region.points);
        
        if (intersections.length >= 2) {
            // Line passes through this region - calculate the distance between entry and exit points
            // Sort intersections by their distance from line start
            const sortedIntersections = intersections.sort((a, b) => {
                const distA = Math.sqrt(
                    (a.point.x - line.start.x) ** 2 + (a.point.y - line.start.y) ** 2
                );
                const distB = Math.sqrt(
                    (b.point.x - line.start.x) ** 2 + (b.point.y - line.start.y) ** 2
                );
                return distA - distB;
            });
            
            // Calculate length between first and last intersection points
            const firstPoint = sortedIntersections[0].point;
            const lastPoint = sortedIntersections[sortedIntersections.length - 1].point;
            
            // Convert intersection points to geographic coordinates
            const firstGeo = mapCanvasToGeo(firstPoint.x, firstPoint.y);
            const lastGeo = mapCanvasToGeo(lastPoint.x, lastPoint.y);
            
            // Calculate segment length in geographic units
            const segmentLength = getGeoDistance(
                firstGeo.longitude, firstGeo.latitude,
                lastGeo.longitude, lastGeo.latitude
            );
            
            totalSlicingLength += segmentLength;
        }
    });
    
    return totalSlicingLength;
}
function updateHealthBarDisplay() {
    // Health bar shows remaining capacity, not used capacity
    
    const healthBar = document.getElementById('health-bar');
    const healthBarText = document.getElementById('health-bar-text');
    
    if (healthBar && healthBarText) {
        const remainingLength = Math.max(0, maxLength - usedLineLength);
        const percentage = maxLength > 0 ? (remainingLength / maxLength) * 100 : 100;
        const isOverLimit = usedLineLength > maxLength;
        
        healthBar.style.width = percentage + '%';
        healthBar.classList.toggle('over-limit', isOverLimit);
        
        const displayPercentage = Math.round(percentage);
        healthBarText.textContent = `${displayPercentage}%`;
    }
}

function checkGameOver() {
    const remainingLength = Math.max(0, maxLength - usedLineLength);
    if (remainingLength <= 0 && !isGameOver) {
        isGameOver = true;
        showGameOverScreen();
    }
}

function showGameOverScreen() {
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const finalScoreValue = document.getElementById('final-score-value');
    const finalMaxScore = document.getElementById('final-max-score');
    
    if (gameOverOverlay && finalScoreValue && finalMaxScore) {
        finalScoreValue.textContent = playerScore;
        finalMaxScore.textContent = `Max: ${maxScore} possible`;
        gameOverOverlay.style.display = 'flex';
    }
}

function hideGameOverScreen() {
    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay) {
        gameOverOverlay.style.display = 'none';
    }
}

function restartGame() {
    // Reset game state
    isGameOver = false;
    
    // Hide game over screen
    hideGameOverScreen();
    
    // Reset the map (this will reset everything)
    resetMap();
}

function constrainPanOffset() {
    if (!mapBounds) return;
    
    // Calculate the current map boundaries in screen coordinates
    const mapLeft = mapBounds.minLon * geoScale * zoom + geoTranslateX * zoom + panOffset.x;
    const mapRight = mapBounds.maxLon * geoScale * zoom + geoTranslateX * zoom + panOffset.x;
    const mapTop = -mapBounds.maxLat * geoScale * zoom + geoTranslateY * zoom + panOffset.y;
    const mapBottom = -mapBounds.minLat * geoScale * zoom + geoTranslateY * zoom + panOffset.y;
    
    // Define minimum visible area (at least 20% of the map should be visible)
    const mapWidth = mapRight - mapLeft;
    const mapHeight = mapBottom - mapTop;
    const minVisibleWidth = mapWidth * 0.2;
    const minVisibleHeight = mapHeight * 0.2;
    
    // Constrain horizontal panning
    if (mapRight < minVisibleWidth) {
        // Map is too far left, pull it back
        panOffset.x += minVisibleWidth - mapRight;
    } else if (mapLeft > window.innerWidth - minVisibleWidth) {
        // Map is too far right, pull it back
        panOffset.x -= mapLeft - (window.innerWidth - minVisibleWidth);
    }
    
    // Constrain vertical panning
    if (mapBottom < minVisibleHeight) {
        // Map is too far up, pull it down
        panOffset.y += minVisibleHeight - mapBottom;
    } else if (mapTop > window.innerHeight - minVisibleHeight) {
        // Map is too far down, pull it up
        panOffset.y -= mapTop - (window.innerHeight - minVisibleHeight);
    }
}

function mapGeoToCanvas(longitude, latitude) {
    const x = longitude * geoScale + geoTranslateX;
    const y = -latitude * geoScale + geoTranslateY; // Invert Y for proper map orientation
    return { x, y };
}

function getCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    // Convert to CSS pixels, no need to multiply by devicePixelRatio
    const x = ((clientX - rect.left) - panOffset.x) / zoom;
    const y = ((clientY - rect.top) - panOffset.y) / zoom;
    return { x, y };
}

function resizeCanvas() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Set canvas internal size to match device pixel ratio
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    
    // Set canvas display size in CSS pixels
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    
    drawCanvas();
}

function resetView() {
    zoom = 1;
    panOffset = { x: 0, y: 0 };
    updateZoomIndicator();
    updateHealthBarDisplay();
    drawCanvas();
}

function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'landmark-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
}


function updateZoomIndicator() {
    const indicator = document.getElementById('zoom-indicator');
    indicator.textContent = `${Math.round(zoom * 2) / 2}x`;
}

function calculatePolygonArea(points) {
    if (points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}


function drawCanvas() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply device pixel ratio scaling for sharp rendering
    ctx.save();
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // Apply zoom and pan (now in CSS pixels)
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);
    
    // Draw grid
    drawGrid();
    
    // Draw Algiers capital marker
    drawAlgiersMarker();
    
    // Draw circle around capital with half polygon area
    drawCapitalCircle();
    
    // Draw preview of new stronghold when drawing a valid line
    drawNewStrongholdPreview();
    
    // Draw all regions
    regions.forEach(region => {
        ctx.fillStyle = region.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3 / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        region.points.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        ctx.closePath();
        
        // Set opacity for fill
        ctx.globalAlpha = 0.4;
        ctx.fill();
        
        // Restore opacity for stroke
        ctx.globalAlpha = 1.0;
        ctx.stroke();
    });
    
    // Draw sliced lines (immovable, darker color)
    slicedLines.forEach(line => {
        ctx.strokeStyle = '#666666'; // Darker gray for sliced lines
        ctx.lineWidth = 2 / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
    });
    
    // Draw all lines
    const allLines = [...lines];
    if (currentLine) allLines.push(currentLine);
    
    allLines.forEach(line => {
        if (!line) return;
        
        // Check if line intersects with capital circle
        const isIllegal = !isLineLegal(line);
        
        // Draw line
        ctx.strokeStyle = isIllegal ? '#DC2626' : '#000000'; // Red if illegal, black otherwise
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
            
            const handleRadius = HANDLE_SIZE / zoom;
            
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
    
    // Draw landmarks on topmost layer
    drawLandmarks();
    
    ctx.restore();
    ctx.restore(); // Restore device pixel ratio scaling
}

function drawLandmarks() {
    landmarks.forEach(landmark => {
        const landmarkPoint = mapGeoToCanvas(landmark.longitude, landmark.latitude);
        
        // Draw gold circle marker for landmark
        ctx.fillStyle = '#FFD700'; // Gold color
        ctx.strokeStyle = '#B8860B'; // Dark gold outline
        ctx.lineWidth = 1 / zoom;
        
        const radius = 6 / zoom;
        
        // Draw circle
        ctx.beginPath();
        ctx.arc(landmarkPoint.x, landmarkPoint.y, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Add a subtle glow effect if hovered
        if (hoveredLandmark === landmark) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.3)'; // Semi-transparent gold
            ctx.beginPath();
            ctx.arc(landmarkPoint.x, landmarkPoint.y, radius * 2, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
}

function drawGrid() {
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5 / zoom;
    const gridSize = 20;
    const startX = Math.floor(-panOffset.x / zoom / gridSize) * gridSize;
    const startY = Math.floor(-panOffset.y / zoom / gridSize) * gridSize;
    const endX = startX + (window.innerWidth / zoom) + gridSize;
    const endY = startY + (window.innerHeight / zoom) + gridSize;
    
    for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
    }
}

function drawAlgiersMarker() {
    const algiersPoint = mapGeoToCanvas(algiersCapital.longitude, algiersCapital.latitude);
    
    // Draw grey circle marker for capital
    ctx.fillStyle = '#808080'; // Grey color
    ctx.strokeStyle = '#000000'; // Black outline
    ctx.lineWidth = 1 / zoom;
    
    const radius = 8 / zoom;
    
    // Draw circle
    ctx.beginPath();
    ctx.arc(algiersPoint.x, algiersPoint.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // Add label
    ctx.fillStyle = '#000000';
    ctx.font = `${12 / zoom}px 'Comic Sans MS', 'Chalkduster', 'Bradley Hand', cursive, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Algiers', algiersPoint.x, algiersPoint.y + (20 / zoom));
}

function drawCapitalCircle() {
    // Calculate total area of brown regime territory (regions containing Algiers)
    const algiersPoint = mapGeoToCanvas(algiersCapital.longitude, algiersCapital.latitude);
    const regimeArea = regions.reduce((sum, region) => {
        if (region.color !== '#4CAF50' && isPointInPolygon(algiersPoint, region.points)) {
            return sum + calculatePolygonArea(region.points);
        }
        return sum;
    }, 0);
    
    // Calculate radius for circle with 50% of regime area
    const circleArea = regimeArea / 2;
    const radius = Math.sqrt(circleArea / Math.PI);
    
    if (radius > 0) {
        // Draw circle with grey fill at 0.2 opacity
        ctx.fillStyle = '#808080'; // Grey color
        ctx.strokeStyle = '#606060'; // Darker grey for outline
        ctx.lineWidth = 1 / zoom;
        
        ctx.beginPath();
        ctx.arc(algiersPoint.x, algiersPoint.y, radius, 0, 2 * Math.PI);
        
        // Set opacity for fill
        ctx.globalAlpha = 0.4;
        ctx.fill();
        
        // Restore opacity for stroke
        ctx.globalAlpha = 1.0;
        ctx.stroke();
    }
}

function drawNewStrongholdPreview() {
    // Show preview when actively drawing a line OR when a valid line exists
    const lineToCheck = currentLine || (lines.length > 0 ? lines[lines.length - 1] : null);
    if (!lineToCheck) return;
    
    // Only show preview if line is legal
    if (!isLineLegal(lineToCheck)) return;
    
    // Calculate what the regime territory would look like after split
    const algiersPoint = mapGeoToCanvas(algiersCapital.longitude, algiersCapital.latitude);
    let newRegimeArea = 0;
    
    // Find which region would contain the capital after split
    for (const region of regions) {
        const splitResult = performPolygonSplit(region.points, lineToCheck);
        if (splitResult) {
            const [leftPoints, rightPoints] = splitResult;
            const leftContainsCapital = isPointInPolygon(algiersPoint, leftPoints);
            const rightContainsCapital = isPointInPolygon(algiersPoint, rightPoints);
            
            if (leftContainsCapital) {
                newRegimeArea += calculatePolygonArea(leftPoints);
            } else if (rightContainsCapital) {
                newRegimeArea += calculatePolygonArea(rightPoints);
            }
        }
    }
    
    // When moving a line, we don't need to recalculate splits
    // Just update the submit button state and redraw
    updateSubmitButtonState();
    
    // Calculate new stronghold radius (50% of new regime area)
    const newStrongholdArea = newRegimeArea / 2;
    const newRadius = Math.sqrt(newStrongholdArea / Math.PI);
    
    if (newRadius > 0) {
        // Draw preview stronghold with dotted outline
        ctx.fillStyle = '#808080'; // Same grey as current stronghold
        ctx.strokeStyle = '#606060'; // Darker grey for outline
        ctx.lineWidth = 1 / zoom;
        
        // Set dotted line style
        ctx.setLineDash([5 / zoom, 3 / zoom]);
        
        ctx.beginPath();
        ctx.arc(algiersPoint.x, algiersPoint.y, newRadius, 0, 2 * Math.PI);
        
        // Set opacity for fill
        ctx.globalAlpha = 0.4;
        ctx.fill();
        
        // Restore opacity for stroke
        ctx.globalAlpha = 1.0;
        ctx.stroke();
        
        // Reset line dash to solid for other drawing operations
        ctx.setLineDash([]);
    }
}

function lineIntersectsCircle(line) {
    // Check if line segment intersects with the grey circle around capital
    // Only calculate stronghold based on brown (regime) regions
    const regimeArea = regions.reduce((sum, region) => {
        if (region.color !== '#4CAF50') { // Only brown regions
            return sum + calculatePolygonArea(region.points);
        }
        return sum;
    }, 0);
    
    const circleArea = regimeArea / 2;
    const radius = Math.sqrt(circleArea / Math.PI);
    
    if (radius <= 0) return false;
    
    const algiersPoint = mapGeoToCanvas(algiersCapital.longitude, algiersCapital.latitude);
    
    // Calculate closest point on line segment to circle center
    const x1 = line.start.x, y1 = line.start.y;
    const x2 = line.end.x, y2 = line.end.y;
    const cx = algiersPoint.x, cy = algiersPoint.y;
    
    // Vector from start to end of segment
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Vector from start to circle center
    const px = cx - x1;
    const py = cy - y1;
    
    // Calculate the parameter t for the projection
    const segmentLengthSquared = dx * dx + dy * dy;
    
    // Handle degenerate case where start and end are the same point
    if (segmentLengthSquared === 0) {
        const distance = Math.sqrt((cx - x1) * (cx - x1) + (cy - y1) * (cy - y1));
        return distance <= radius;
    }
    
    // Project the point onto the line and clamp to segment
    let t = (px * dx + py * dy) / segmentLengthSquared;
    t = Math.max(0, Math.min(1, t)); // Clamp t to [0, 1]
    
    // Find the closest point on the segment
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    // Calculate distance from closest point to circle center
    const distance = Math.sqrt((cx - closestX) * (cx - closestX) + (cy - closestY) * (cy - closestY));
    
    return distance <= radius;
}

function isLineLegal(line) {
    // Check if line intersects stronghold
    if (lineIntersectsCircle(line)) {
        return false;
    }
    
    // Check if line has more than 2 intersections with any region boundary
    for (const region of regions) {
        const intersections = lineIntersectsPolygon(line, region.points);
        if (intersections.length > 2) {
            return false;
        }
    }
    
    return true;
}
function getClickedHandle(point) {
    const handleRadius = HANDLE_SIZE / zoom;
    
    // Only check handles for unsliced lines
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

function getHoveredLandmark(point) {
    const landmarkRadius = 12 / zoom; // Larger hitbox for easier hovering
    
    for (const landmark of landmarks) {
        const landmarkPoint = mapGeoToCanvas(landmark.longitude, landmark.latitude);
        const distance = Math.sqrt((point.x - landmarkPoint.x) ** 2 + (point.y - landmarkPoint.y) ** 2);
        if (distance <= landmarkRadius) {
            return landmark;
        }
    }
    return null;
}

function updateCursor() {
    const container = document.querySelector('.container');
    container.classList.remove('panning', 'handle-hover');
    
    if (hoveredHandle) {
        container.classList.add('handle-hover');
    } else if (isPanning) {
        container.classList.add('panning');
    }
}

// Touch helper functions
function getDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(touch1, touch2) {
    return {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
    };
}

function updateTooltip(e) {
    if (hoveredLandmark) {
        tooltip.innerHTML = `
            <div class="tooltip-title">${hoveredLandmark.icon} ${hoveredLandmark.place}</div>
            <div class="tooltip-description">${hoveredLandmark.description}</div>
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 10 + 'px';
        tooltip.style.top = e.clientY - 10 + 'px';
    } else {
        tooltip.style.display = 'none';
    }
}

// Helper geometric functions
function getLineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }
    
    return null;
}

function lineIntersectsPolygon(line, polygonPoints) {
    const intersections = [];
    
    for (let i = 0; i < polygonPoints.length; i++) {
        const j = (i + 1) % polygonPoints.length;
        const intersection = getLineIntersection(line.start, line.end, polygonPoints[i], polygonPoints[j]);
        if (intersection) {
            intersections.push({
                point: intersection,
                edgeIndex: i
            });
        }
    }
    
    return intersections;
}

function isPointOnLeftSide(lineStart, lineEnd, point) {
    return ((lineEnd.x - lineStart.x) * (point.y - lineStart.y) - (lineEnd.y - lineStart.y) * (point.x - lineStart.x)) > 0;
}

function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
            (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}

function performPolygonSplit(polygonPoints, line) {
    const intersections = lineIntersectsPolygon(line, polygonPoints);
    
    if (intersections.length !== 2) {
        return null; // Can't split with anything other than exactly 2 intersections
    }
    
    // Sort intersections by their position along the polygon edge
    intersections.sort((a, b) => a.edgeIndex - b.edgeIndex);
    
    const [int1, int2] = intersections;
    
    const poly1 = [];
    const poly2 = [];
    
    // Construct first polygon: from int1 to int2 along polygon edges
    poly1.push(int1.point);
    
    // Add points between int1 and int2 (following polygon boundary)
    let currentIndex = int1.edgeIndex + 1;
    while (currentIndex !== int2.edgeIndex + 1) {
        if (currentIndex >= polygonPoints.length) {
            currentIndex = 0; // Wrap around
        }
        if (currentIndex === int2.edgeIndex + 1) break;
        
        poly1.push(polygonPoints[currentIndex]);
        currentIndex++;
    }
    
    poly1.push(int2.point);
    
    // Construct second polygon: from int2 to int1 along polygon edges
    poly2.push(int2.point);
    
    // Add points between int2 and int1 (following polygon boundary)
    currentIndex = int2.edgeIndex + 1;
    while (currentIndex !== int1.edgeIndex + 1) {
        if (currentIndex >= polygonPoints.length) {
            currentIndex = 0; // Wrap around
        }
        if (currentIndex === int1.edgeIndex + 1) break;
        
        poly2.push(polygonPoints[currentIndex]);
        currentIndex++;
    }
    
    poly2.push(int1.point);
    
    return [poly1, poly2];
}

function resetToOriginalRegion() {
    if (originalRegion) {
        regions = [{
            id: generateId(),
            points: [...originalRegion.points],
            color: colorPalette[0]
        }];
        nextColorIndex = 1;
        
        calculateAndUpdateScores();
        updateSubmitButtonState();
    }
}

function recalculateSplitWithCurrentLine() {
    if (lines.length > 0) {
        const line = lines[0];
        const intersectsCapital = lineIntersectsCircle(line);
        
        if (!intersectsCapital) {
            resetToOriginalRegion();
            splitRegionsWithLine(line);
        }
        // If intersects capital, don't split - just keep regions as they are
    }
}

function splitRegionsWithLine(line) {
    const regionsToRemove = [];
    const newRegions = [];
    const algiersPoint = mapGeoToCanvas(algiersCapital.longitude, algiersCapital.latitude);
    
    regions.forEach((region, index) => {
        const splitResult = performPolygonSplit(region.points, line);
        if (splitResult) {
            regionsToRemove.push(index);
            
            const [leftPoints, rightPoints] = splitResult;
            
            // Check which region contains the capital
            const leftContainsCapital = isPointInPolygon(algiersPoint, leftPoints);
            const rightContainsCapital = isPointInPolygon(algiersPoint, rightPoints);
            
            let leftRegion, rightRegion;
            
            if (leftContainsCapital) {
                // Left region contains capital - keep original color
                leftRegion = {
                    id: generateId(),
                    points: leftPoints,
                    color: region.color
                };
                // Right region gets green color
                rightRegion = {
                    id: generateId(),
                    points: rightPoints,
                    color: '#4CAF50' // Green color
                };
            } else if (rightContainsCapital) {
                // Right region contains capital - keep original color
                rightRegion = {
                    id: generateId(),
                    points: rightPoints,
                    color: region.color
                };
                // Left region gets green color
                leftRegion = {
                    id: generateId(),
                    points: leftPoints,
                    color: '#4CAF50' // Green color
                };
            }
            
            newRegions.push(leftRegion, rightRegion);
        }
    });
    
    // Remove split regions (in reverse order to maintain indices)
    regionsToRemove.reverse().forEach(index => {
        regions.splice(index, 1);
    });
    
    // Add new regions
    regions.push(...newRegions);
    
    // Update scores after splitting
    calculateAndUpdateScores();
    
    // Update submit button state
    updateSubmitButtonState();
}

function clearMap() {
    // Don't allow clearing during game over
    if (isGameOver) return;
    
    // Clear only unsliced lines
    lines = [];
    currentLine = null;
    
    // Update submit button state
    updateSubmitButtonState();
    
    // Redraw canvas
    drawCanvas();
}

function resetMap() {
    // Don't allow resetting during game over
    if (isGameOver) return;
    
    // Clear all lines
    lines = [];
    slicedLines = [];
    currentLine = null;
    
    // Reset used line length
    usedLineLength = 0;
    
    // Reset to original region
    resetToOriginalRegion();
    
    // Update submit button state
    updateSubmitButtonState();
    
    // Update health bar display
    updateHealthBarDisplay();
    
    // Redraw canvas
    drawCanvas();
}

// Event handlers
function handleMouseDown(e) {
    // Prevent interaction during game over
    if (isGameOver) return;
    
    // Prevent mouse events during touch interactions
    if (isPinching) return;
    
    const point = getCanvasPoint(e.clientX, e.clientY);
    
    // Check if clicking on a handle
    const clickedHandle = getClickedHandle(point);
    if (clickedHandle) {
        resizeHandle = clickedHandle;
        return;
    }
    
    // Check if we should pan (right click or ctrl/cmd + click)
    if (e.button === 2 || e.ctrlKey || e.metaKey) {
        isPanning = true;
        lastPanPoint = { x: e.clientX, y: e.clientY };
        updateCursor();
        return;
    }
    
    // Start drawing a new line
    currentLine = {
        id: generateId(),
        start: point,
        end: point
    };
    isDrawing = true;
}

function handleMouseMove(e) {
    // Prevent interaction during game over
    if (isGameOver) return;
    
    // Prevent mouse events during touch interactions
    if (isPinching) return;
    
    const point = getCanvasPoint(e.clientX, e.clientY);
    
    if (isDrawing && currentLine) {
        currentLine.end = point;
        drawCanvas();
    } else if (isPanning && lastPanPoint) {
        const deltaX = e.clientX - lastPanPoint.x;
        const deltaY = e.clientY - lastPanPoint.y;
        panOffset.x += deltaX;
        panOffset.y += deltaY;
        constrainPanOffset();
        lastPanPoint = { x: e.clientX, y: e.clientY };
        drawCanvas();
    } else if (resizeHandle) {
        // Update the line being resized
        const lineIndex = lines.findIndex(line => line.id === resizeHandle.lineId);
        if (lineIndex !== -1) {
            lines[lineIndex][resizeHandle.handle] = point;
            // Only update submit button state and redraw (no territorial changes while dragging)
            updateSubmitButtonState();
            drawCanvas();
        }
    } else {
        const newHoveredHandle = getClickedHandle(point);
        
        // Update hover states
        const wasHoveringHandle = newHoveredHandle !== null;
        
        if (wasHoveringHandle) {
            // Hovering over handle
            if (hoveredHandle !== newHoveredHandle) {
                hoveredHandle = newHoveredHandle;
                updateCursor();
            }
        } else {
            // Not hovering over anything special
            if (hoveredHandle) {
                const newHoveredLandmark = getHoveredLandmark(point);
                hoveredHandle = null;
                updateCursor();
            }
        }
        
        // Redraw if handle hover state changed
        if (newHoveredHandle !== hoveredHandle) {
            hoveredHandle = newHoveredHandle;
        }
        
        if (wasHoveringHandle !== (hoveredHandle !== null)) {
            drawCanvas();
        }
        
        // Update landmark hover
        const newHoveredLandmark = getHoveredLandmark(point);
        if (newHoveredLandmark !== hoveredLandmark) {
            hoveredLandmark = newHoveredLandmark;
            updateTooltip(e);
            drawCanvas();
        }
    }
}

function handleMouseUp() {
    // Prevent interaction during game over
    if (isGameOver) return;
    
    // Prevent mouse events during touch interactions
    if (isPinching) return;
    
    if (isDrawing && currentLine) {
        // Add the completed line to the lines array
        lines.push(currentLine);
        currentLine = null;
        updateSubmitButtonState();
        updateHealthBarDisplay();
        drawCanvas();
    }
    
    isDrawing = false;
    isPanning = false;
    lastPanPoint = null;
    resizeHandle = null;
    draggingCapitalId = null;
    updateCursor();
}

function handleWheel(e) {
    e.preventDefault();
    const point = getCanvasPoint(e.clientX, e.clientY);
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor));
    
    if (newZoom !== zoom) {
        const zoomChange = newZoom - zoom;
        // Adjust pan offset to keep the mouse point stationary during zoom
        panOffset.x -= point.x * zoomChange;
        panOffset.y -= point.y * zoomChange;
        zoom = newZoom;
        constrainPanOffset();
        updateZoomIndicator();
        drawCanvas();
    }
}

// Touch event handlers
function handleTouchStart(e) {
    // Prevent interaction during game over
    if (isGameOver) return;
    
    e.preventDefault();
    
    if (e.touches.length === 2) {
        // Two fingers - start pinch to zoom
        isPinching = true;
        initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
        initialPinchCenterScreen = getMidpoint(e.touches[0], e.touches[1]);
        initialPinchZoom = zoom;
        initialPinchPanOffset = { x: panOffset.x, y: panOffset.y };
    } else if (e.touches.length === 1) {
        // Single finger - check for handle or start drawing
        const point = getCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
        
        // Check if touching on a handle
        const clickedHandle = getClickedHandle(point);
        if (clickedHandle) {
            resizeHandle = clickedHandle;
            return;
        }
        
        // Start drawing a new line
        currentLine = {
            id: generateId(),
            start: point,
            end: point
        };
        isDrawing = true;
    }
    
    drawCanvas();
}

function handleTouchMove(e) {
    // Prevent interaction during game over
    if (isGameOver) return;
    
    e.preventDefault();
    
    if (isPinching && e.touches.length === 2) {
        // Handle pinch to zoom
        const currentPinchDistance = getDistance(e.touches[0], e.touches[1]);
        const currentPinchCenterScreen = getMidpoint(e.touches[0], e.touches[1]);
        
        // Calculate scale factor
        const scale = currentPinchDistance / initialPinchDistance;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initialPinchZoom * scale));
        
        // Calculate pan offset to keep the pinch center stationary
        const centerDelta = {
            x: currentPinchCenterScreen.x - initialPinchCenterScreen.x,
            y: currentPinchCenterScreen.y - initialPinchCenterScreen.y
        };
        
        // Convert initial pinch center to canvas coordinates
        const rect = canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        const initialCanvasX = ((initialPinchCenterScreen.x - rect.left) * devicePixelRatio - initialPinchPanOffset.x) / initialPinchZoom;
        const initialCanvasY = ((initialPinchCenterScreen.y - rect.top) * devicePixelRatio - initialPinchPanOffset.y) / initialPinchZoom;
        
        // Update pan offset to maintain the same canvas point under the pinch center
        panOffset.x = (initialPinchCenterScreen.x - rect.left) * devicePixelRatio - initialCanvasX * newZoom + centerDelta.x;
        panOffset.y = (initialPinchCenterScreen.y - rect.top) * devicePixelRatio - initialCanvasY * newZoom + centerDelta.y;
        
        zoom = newZoom;
        constrainPanOffset();
        updateZoomIndicator();
        drawCanvas();
    } else if (isDrawing && e.touches.length === 1 && currentLine) {
        // Handle single finger drawing
        const point = getCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
        currentLine.end = point;
        drawCanvas();
    } else if (resizeHandle && e.touches.length === 1) {
        // Handle line resizing
        const point = getCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
        const lineIndex = lines.findIndex(line => line.id === resizeHandle.lineId);
        if (lineIndex !== -1) {
            lines[lineIndex][resizeHandle.handle] = point;
            updateSubmitButtonState();
            drawCanvas();
        }
    }
}

function handleTouchEnd(e) {
    // Prevent interaction during game over
    if (isGameOver) return;
    
    e.preventDefault();
    
    if (isDrawing && currentLine) {
        // Add the completed line to the lines array
        lines.push(currentLine);
        currentLine = null;
        updateSubmitButtonState();
        updateHealthBarDisplay();
        drawCanvas();
    }
    
    // Reset touch states
    isDrawing = false;
    isPinching = false;
    resizeHandle = null;
    updateCursor();
}

// Start the application
function handleBrowserZoom() {
    // Recalculate everything when browser zoom changes
    resizeCanvas();
}

// Listen for browser zoom changes
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleBrowserZoom, 100);
});

document.addEventListener('DOMContentLoaded', init);