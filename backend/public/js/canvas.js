// ============================================
// Canvas Drawing Engine
// ============================================

const Canvas = (() => {
    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let isEnabled = false; // only true when this player is the drawer
    let currentColor = '#000000';
    let currentWidth = 6;
    let lastX = 0;
    let lastY = 0;

    function init() {
        // Mouse events
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);

        // Touch events
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);

        // Color palette
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                currentColor = swatch.dataset.color;
            });
        });

        // Stroke width
        document.querySelectorAll('.stroke-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentWidth = parseInt(btn.dataset.width);
            });
        });

        // Clear button
        document.getElementById('btn-clear-canvas').addEventListener('click', () => {
            if (!isEnabled) return;
            clearCanvas();
            Socket.send('clear_canvas');
        });

        // Set canvas to white
        clearCanvas();
    }

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    // ---- Mouse Handlers ----
    function onMouseDown(e) {
        if (!isEnabled) return;
        const { x, y } = getCanvasCoords(e);
        startStroke(x, y);
        Socket.send('draw', { x, y, color: currentColor, strokeWidth: currentWidth, drawType: 'start' });
    }

    function onMouseMove(e) {
        if (!isEnabled || !isDrawing) return;
        const { x, y } = getCanvasCoords(e);
        drawStroke(x, y);
        Socket.send('draw', { x, y, color: currentColor, strokeWidth: currentWidth, drawType: 'draw' });
    }

    function onMouseUp() {
        if (!isEnabled || !isDrawing) return;
        isDrawing = false;
        Socket.send('draw', { x: lastX, y: lastY, color: currentColor, strokeWidth: currentWidth, drawType: 'end' });
    }

    // ---- Touch Handlers ----
    function onTouchStart(e) {
        if (!isEnabled) return;
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasCoords(touch);
        startStroke(x, y);
        Socket.send('draw', { x, y, color: currentColor, strokeWidth: currentWidth, drawType: 'start' });
    }

    function onTouchMove(e) {
        if (!isEnabled || !isDrawing) return;
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasCoords(touch);
        drawStroke(x, y);
        Socket.send('draw', { x, y, color: currentColor, strokeWidth: currentWidth, drawType: 'draw' });
    }

    function onTouchEnd() {
        if (!isEnabled || !isDrawing) return;
        isDrawing = false;
        Socket.send('draw', { x: lastX, y: lastY, color: currentColor, strokeWidth: currentWidth, drawType: 'end' });
    }

    // ---- Drawing Functions ----
    function startStroke(x, y) {
        isDrawing = true;
        lastX = x;
        lastY = y;
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function drawStroke(x, y) {
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        lastX = x;
        lastY = y;
    }

    function clearCanvas() {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ---- Remote Drawing (from other players) ----
    function handleRemoteDraw(data) {
        if (data.drawType === 'start') {
            lastX = data.x;
            lastY = data.y;
            return;
        }
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
        lastX = data.x;
        lastY = data.y;
    }

    function setEnabled(enabled) {
        isEnabled = enabled;
        canvas.classList.toggle('disabled', !enabled);
        document.getElementById('drawing-tools').style.display = enabled ? 'flex' : 'none';
    }

    return { init, handleRemoteDraw, clearCanvas, setEnabled };
})();
