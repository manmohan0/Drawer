// import { Shape, ShapeType } from "@/types";

// let shapes: Shape[];

// export const initDraw = async (canvas: HTMLCanvasElement, shapeType: ShapeType, roomId: string, ws: WebSocket) => {
//     const ctx = canvas.getContext('2d');
//     if (!ctx) return;
    
//     // shapes = await getExistingShapes(roomId);
    
//     // Set initial canvas size
//     canvas.width = window.innerWidth;
//     canvas.height = window.innerHeight;

//     ctx.lineWidth = 2; // Set line width
//     // clearCanvas(canvas, ctx);

//     // Update canvas size on window resize
//     window.addEventListener('resize', () => {
//         canvas.width = window.innerWidth;
//         canvas.height = window.innerHeight;
//         // You might want to redraw content here if necessary
//     });

//     let startX: number = 0;
//     let startY: number = 0;
//     let clicked: boolean = false;

//     canvas.addEventListener("mousedown", (e) => {
//         clicked = true;
//         const canvasClient = canvas.getBoundingClientRect();
//         startX = e.clientX - canvasClient.left;
//         startY = e.clientY - canvasClient.top;
//     });

//     canvas.addEventListener("mousemove", e => {
//         if (clicked) {
//             const canvasClient = canvas.getBoundingClientRect();
//             const currentX = e.clientX - canvasClient.left;
//             const currentY = e.clientY - canvasClient.top;
//             const width = currentX - startX;
//             const height = currentY - startY;
//             clearCanvas(canvas, ctx);
//             if (shapeType === "rect") { 
//                 ctx.strokeRect(startX, startY, width, height);
//             } else if (shapeType === "line") {
//                 ctx.beginPath();
//                 ctx.moveTo(startX, startY);
//                 ctx.lineTo(currentX, currentY);
//                 ctx.stroke();
//             } else if (shapeType === "circle") {
//                 const radius = Math.sqrt(width * width + height * height);
//                 ctx.beginPath();
//                 ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
//                 ctx.stroke();
//             }
//         }
//     });

//     canvas.addEventListener("mouseup", e => {
//         clicked = false
//         const width = e.clientX - startX;
//         const height = e.clientY - startY;
//         const canvasClient = canvas.getBoundingClientRect();
//         const currentX = e.clientX - canvasClient.left;
//         const currentY = e.clientY - canvasClient.top;
//         let shape: Shape;
//         if (shapeType === "line") {
//             shape = {
//                 startX: startX,
//                 startY: startY,
//                 endX: currentX,
//                 endY: currentY,
//                 type: shapeType
//             }
//         } else if (shapeType === "rect") {
//             shape = {
//                 type: shapeType,
//                 startX: startX,
//                 startY: startY,
//                 width: width,
//                 height: height
//             };
//         } else if (shapeType === "circle") {
//             shape = {
//                 type: shapeType,
//                 centerX: startX,
//                 centerY: startY,
//                 radius: Math.sqrt(width * width + height * height)
//             }
//         } else {
//             return;
//         }
//         console.log("Sending shape:", shape);
//         ws.send(JSON.stringify({
//             type: 'chat',
//             roomId,
//             shape: JSON.stringify(shape)
//         }));
//     })
// }