import { BACKEND_URL } from "@/config";
import { Shape } from "@/types";
import axios from "axios";

let shapes: Shape[];

export const initDraw = async (canvas: HTMLCanvasElement, shapeType: 'rect' | 'circle' | 'line', roomId: string, ws: WebSocket) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    shapes = await getExistingShapes(roomId);

    ws.onmessage = (e) => {
        const data = JSON.parse(e.data)
        console.log(data)
        if (data.type == "shape created") {
            shapes.push(JSON.parse(data.shape));
            console.log(shapes)
            clearCanvas(canvas, ctx);
        }

        if (data.type == 'cleared') {
            shapes = [];
            clearCanvas(canvas, ctx)
        }
    }
    
    // Set initial canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.lineWidth = 2; // Set line width
    clearCanvas(canvas, ctx);

    // Update canvas size on window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // You might want to redraw content here if necessary
    });

    let startX: number = 0;
    let startY: number = 0;
    let clicked: boolean = false;

    canvas.addEventListener("mousedown", (e) => {
        clicked = true;
        const canvasClient = canvas.getBoundingClientRect();
        startX = e.clientX - canvasClient.left;
        startY = e.clientY - canvasClient.top;
    });

    canvas.addEventListener("mousemove", e => {
        if (clicked) {
            const canvasClient = canvas.getBoundingClientRect();
            const currentX = e.clientX - canvasClient.left;
            const currentY = e.clientY - canvasClient.top;
            const width = currentX - startX;
            const height = currentY - startY;
            clearCanvas(canvas, ctx);
            console.log(shapeType)
            if (shapeType === "rect") { 
                ctx.strokeRect(startX, startY, width, height);
            } else if (shapeType === "line") {
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(currentX, currentY);
                ctx.stroke();
            }
        }
    });

    canvas.addEventListener("mouseup", e => {
        clicked = false
        const width = e.clientX - startX;
        const height = e.clientY - startY;
        // const canvasClient = canvas.getBoundingClientRect();
        // const currentX = e.clientX - canvasClient.left;
        // const currentY = e.clientY - canvasClient.top;

        const shape = {
            type: shapeType,
            startX: startX,
            startY: startY,
            width: width,
            height: height,
            endX: e.clientX,
            endY: e.clientY
        };
        // shapes.push(shape); 
        ws.send(JSON.stringify({
            type: 'chat',
            roomId,
            shape: JSON.stringify(shape)
        }));
    })
}

export const clearCanvas = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    shapes.forEach(shape => {
        if (shape.type === "rect") {
            ctx.strokeRect(shape.startX, shape.startY, shape.width as number, shape.height as number);
        } else if (shape.type === "line") {
            ctx.beginPath();
            ctx.moveTo(shape.startX, shape.startY);
            ctx.lineTo(shape.startX + (shape.endX as number), shape.startY + (shape.endY as number));
            ctx.stroke();
        }
    })
}

export const getExistingShapes = async (canvasId: string) => {
    try {

        const res = await axios.get(`${BACKEND_URL}/room/shapes/${canvasId}`, {
            headers: {
                "authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ODY4Mjg2ZC05Y2MzLTQzNzktOWFkZi0xN2QzMTRmNmRiM2MiLCJpYXQiOjE3NjExMDI4NTB9.c3OUsVFIqFbIazy4CXcQmF2kJKEfF2jbWUgi-YphCxw"
            }
        })
        const data = res.data.shapes;
        
        if (data) {
            const shapes = data.map((ele: { shape: string }) => {
                const shapeData = JSON.parse(ele.shape);
                return shapeData;
            })
            return shapes;
        }
        
    } catch (e) {
        console.log(e)
    }
}