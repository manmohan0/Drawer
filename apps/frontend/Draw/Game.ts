import { BACKEND_URL } from "@/config";
import { Shape, ShapeType } from "@/types";
import axios from "axios";

export class Game {
  private roomId: string;
  private ws: WebSocket;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private existingShapes: Shape[];
  private isClicked: boolean;
  private startX: number = 0;
  private startY: number = 0;
  private selectedTool: ShapeType = "rect";

  constructor(canvas: HTMLCanvasElement, roomId: string, ws: WebSocket) {
    this.canvas = canvas;
    this.roomId = roomId;
    this.ws = ws;
    this.ctx = canvas.getContext("2d")!;
    this.existingShapes = [];
    this.isClicked = false;
    this.init();
    this.initHandlers();
    this.initMouseHandlers();
  }

  setTool = (tool: ShapeType) => {
    this.selectedTool = tool;
  };

  mouseDownHandler = (e: MouseEvent) => {
    this.isClicked = true;
    const canvasClient = this.canvas.getBoundingClientRect();
    this.startX = e.clientX - canvasClient.left;
    this.startY = e.clientY - canvasClient.top;
    console.log("mouse down at", this.startX, this.startY);
  };

  mouseMoveHandler = (e: MouseEvent) => {
    if (this.isClicked) {
      const canvasClient = this.canvas.getBoundingClientRect();
      const currentX = e.clientX - canvasClient.left;
      const currentY = e.clientY - canvasClient.top;
      const width = currentX - this.startX;
      const height = currentY - this.startY;
      this.clearCanvas();
      if (this.selectedTool === "rect") {
        this.ctx.strokeRect(this.startX, this.startY, width, height);
      } else if (this.selectedTool === "line") {
        this.ctx.beginPath();
        this.ctx.moveTo(this.startX, this.startY);
        this.ctx.lineTo(currentX, currentY);
        this.ctx.stroke();
        console.log("mouse moved to", currentX, currentY);
      } else if (this.selectedTool === "circle") {
        const radius = Math.sqrt(width * width + height * height);
        this.ctx.beginPath();
        this.ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
        this.ctx.stroke();
      }
    }
  };

  mouseUpHandler = (e: MouseEvent) => {
    this.isClicked = false;
    const width = e.clientX - this.startX;
    const height = e.clientY - this.startY;
    const canvasClient = this.canvas.getBoundingClientRect();
    const currentX = e.clientX - canvasClient.left;
    const currentY = e.clientY - canvasClient.top;
    let shape: Shape;
    if (this.selectedTool === "line") {
        console.log("Creating line shape at", this.startX, this.startY, currentX, currentY);
      shape = {
        startX: this.startX,
        startY: this.startY,
        endX: currentX,
        endY: currentY,
        type: this.selectedTool,
      };
    } else if (this.selectedTool === "rect") {
      shape = {
        type: this.selectedTool,
        startX: this.startX,
        startY: this.startY,
        width: width,
        height: height,
      };
    } else if (this.selectedTool === "circle") {
      shape = {
        type: this.selectedTool,
        centerX: this.startX,
        centerY: this.startY,
        radius: Math.sqrt(width * width + height * height),
      };
    } else {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "chat",
        roomId: this.roomId,
        shape: JSON.stringify(shape),
      })
    );
  };

  initHandlers = () => {
    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type == "shape created") {
        this.existingShapes.push(JSON.parse(data.shape));
        // console.log(shapes)
        this.clearCanvas();
      }

      if (data.type == "cleared") {
        this.existingShapes = [];
        this.clearCanvas();
      }
    };
  };

  init = async () => {
    if (!this.ctx) return;

    this.existingShapes = await this.getExistingShapes(this.roomId);

    // this.ws.onmessage = (e) => {
    //   const data = JSON.parse(e.data);
    //   if (data.type == "shape created") {
    //     this.existingShapes.push(JSON.parse(data.shape));
    //     console.log(this.existingShapes);
    //     this.clearCanvas();
    //   }

    //   if (data.type == "cleared") {
    //     this.existingShapes = [];
    //     this.clearCanvas();
    //   }
    // };

    // Set initial canvas size
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.ctx.lineWidth = 2;

    // Update canvas size on window resize
    window.addEventListener("resize", () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
    this.clearCanvas();
  };

  initMouseHandlers = () => {
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);

    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);

    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
  };

  getExistingShapes = async (canvasId: string) => {
    try {
      const res = await axios.get(`${BACKEND_URL}/room/shapes/${canvasId}`, {
        headers: {
          authorization:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1ODY4Mjg2ZC05Y2MzLTQzNzktOWFkZi0xN2QzMTRmNmRiM2MiLCJpYXQiOjE3NjExMDI4NTB9.c3OUsVFIqFbIazy4CXcQmF2kJKEfF2jbWUgi-YphCxw",
        },
      });
      const data = res.data.shapes;

      if (data) {
        const shapes = data.map((ele: { shape: string }) => {
          const shapeData = JSON.parse(ele.shape);
          return shapeData;
        });
        return shapes;
      }
    } catch (e) {
      console.log(e);
    }
  };

  clearCanvas = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.existingShapes.forEach((shape) => {
      if (shape.type === "rect") {
        this.ctx.strokeRect(
          shape.startX,
          shape.startY,
          shape.width,
          shape.height
        );
      } else if (shape.type === "line") {
        this.ctx.beginPath();
        this.ctx.moveTo(shape.startX, shape.startY);
        this.ctx.lineTo(shape.endX, shape.endY);
        this.ctx.stroke();
      } else if (shape.type === "circle") {
        this.ctx.beginPath();
        this.ctx.arc(
          shape.centerX,
          shape.centerY,
          shape.radius,
          0,
          2 * Math.PI
        );
        this.ctx.stroke();
      }
    });
  };

  destroy = () => {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
  };
}
