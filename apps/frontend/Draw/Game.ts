import { BACKEND_URL } from "@/config";
import { selector, Shape, ShapeType } from "@/types";
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
  private selectedShape: Shape | null = null;
  private shapeSelectors: selector[] = [];
  private draggedSelector: selector | null = null;
  private originalShape: Shape | null = null;

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

  getTool = () => {
    return this.selectedTool;
  };

  mouseDownHandler = (e: MouseEvent) => {
    this.isClicked = true;
    const canvasClient = this.canvas.getBoundingClientRect();
    this.startX = e.clientX - canvasClient.left;
    this.startY = e.clientY - canvasClient.top;

    if (this.selectedTool === "pointer") {
      const hit = this.hitTest(this.startX, this.startY);
      this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));
      if (hit && hit.type === "selector" && this.selectedShape) {
        this.draggedSelector = hit;
      } else {
        this.draggedSelector = null;
      }
    }
  };

  mouseMoveHandler = (e: MouseEvent) => {
    if (
      this.isClicked &&
      this.selectedTool !== "pointer" &&
      !this.selectedShape
    ) {
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
      } else if (this.selectedTool === "circle") {
        const radius = Math.sqrt(width * width + height * height);
        this.ctx.beginPath();
        this.ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
        this.ctx.stroke();
      }
    }

    console.log(this.isClicked, this.selectedShape, this.originalShape)
    if (this.isClicked && this.selectedShape && this.originalShape) {
      const canvasClient = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - canvasClient.left;
      const mouseY = e.clientY - canvasClient.top;

      const deltaX = mouseX - this.startX;
      const deltaY = mouseY - this.startY;
      console.log("DeltaX:", deltaX, "DeltaY:", deltaY);
      if (this.draggedSelector) {
        console.log("Resizing shape");
        if (
          this.selectedShape.type === "rect" &&
          this.originalShape.type === "rect"
        ) {
          const originalRect = this.originalShape;
          const rect = this.selectedShape;
          const selectorId = this.draggedSelector.id;

          switch (selectorId) {
            case 1: // top-left
              rect.startX = originalRect.startX + deltaX;
              rect.startY = originalRect.startY + deltaY;
              rect.width = originalRect.width - deltaX;
              rect.height = originalRect.height - deltaY;
              break;
            case 2: // top-right
              rect.startY = originalRect.startY + deltaY;
              rect.width = originalRect.width + deltaX;
              rect.height = originalRect.height - deltaY;
              break;
            case 3: // bottom-right
              rect.width = originalRect.width + deltaX;
              rect.height = originalRect.height + deltaY;
              break;
            case 4: // bottom-left
              rect.startX = originalRect.startX + deltaX;
              rect.width = originalRect.width - deltaX;
              rect.height = originalRect.height + deltaY;
              break;
          }

          this.updateSelectors(rect);
          this.clearCanvas();
        } else if (
          this.selectedShape.type === "circle" &&
          this.originalShape.type === "circle"
        ) {
          const circle = this.selectedShape;
          const originalCircle = this.originalShape;

          circle.radius = Math.sqrt(
            (originalCircle.radius + deltaX) ** 2 +
              (originalCircle.radius + deltaY) ** 2
          );

          this.updateSelectors(circle);
          this.clearCanvas();
        } else if (
          this.selectedShape.type === "line" &&
          this.originalShape.type === "line"
        ) {
          const line = this.selectedShape;
          const originalLine = this.originalShape;
          const selectorId = this.draggedSelector.id;

          switch (selectorId) {
            case 1: // start point
              line.startX = originalLine.startX + deltaX;
              line.startY = originalLine.startY + deltaY;
              break;
            case 2: // end point
              line.endX = originalLine.endX + deltaX;
              line.endY = originalLine.endY + deltaY;
              break;
          }

          this.updateSelectors(line);
        }
      } else {
        // Moving the entire shape
        if (this.selectedShape.type === "rect" && this.originalShape.type === "rect") {
          const rect = this.selectedShape;
          rect.startX = this.originalShape.startX + deltaX;
          rect.startY = this.originalShape.startY + deltaY;

          this.updateSelectors(rect);
        } else if (this.selectedShape.type === "circle" && this.originalShape.type === "circle") {
          const circle = this.selectedShape;
          circle.centerX = this.originalShape.centerX + deltaX;
          circle.centerY = this.originalShape.centerY + deltaY;

          this.updateSelectors(circle);
        } else if (this.selectedShape.type === "line" && this.originalShape.type === "line") {
          const line = this.selectedShape;
          line.startX = this.originalShape.startX + deltaX;
          line.startY = this.originalShape.startY + deltaY;
          line.endX = this.originalShape.endX + deltaX;
          line.endY = this.originalShape.endY + deltaY;

          this.updateSelectors(line);
        }
      }
      this.clearCanvas();
    }
  };

  mouseUpHandler = (e: MouseEvent) => {
    if (this.draggedSelector) {
      this.isClicked = false;

      let shapeId: number = -1;
      if (this.selectedShape?.type != "pointer" && this.selectedShape?.id) {
        shapeId = this.selectedShape?.id;
      }
      // else if (this.selectedShape?.type === 'circle' && this.selectedShape.id) {
      // shapeId = this.selectedShape.id;
      // } else if
      this.ws.send(
        JSON.stringify({
          type: "update_shape",
          room: this.roomId,
          shapeId: shapeId,
          shape: JSON.stringify(this.selectedShape),
        })
      );

      this.draggedSelector = null;
      this.originalShape = null;

      return;
    }
    this.isClicked = false;
    const width = e.clientX - this.startX;
    const height = e.clientY - this.startY;
    const canvasClient = this.canvas.getBoundingClientRect();
    const currentX = e.clientX - canvasClient.left;
    const currentY = e.clientY - canvasClient.top;
    let shape: Shape;
    if (this.selectedTool === "line") {
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

  mouseClickHandler = (e: MouseEvent) => {
    if (this.selectedTool === "pointer") {
      const canvasClient = this.canvas.getBoundingClientRect();
      const x = e.clientX - canvasClient.left;
      const y = e.clientY - canvasClient.top;
      const hitResult = this.hitTest(x, y);

      if (!hitResult) {
        // Clicked on empty space
        this.selectedShape = null;
        this.shapeSelectors = [];
      } else if (hitResult.type === "selector") {
        // Clicked on a selector, do nothing to selection
      } else {
        // Clicked on a shape
        this.selectedShape = hitResult;
        if (hitResult.type === "rect") {
          this.updateSelectors(hitResult);
        } else if (hitResult.type === "circle") {
          const radius = 6;
          this.shapeSelectors = [];
          this.shapeSelectors.push({
            id: 1,
            centerX: hitResult.centerX,
            centerY: hitResult.centerY,
            radius,
            type: "selector",
          });
        } else if (hitResult.type === "line") {
          const radius = 6;
          this.shapeSelectors = [];
          this.shapeSelectors.push({
            id: 1,
            centerX: hitResult.startX,
            centerY: hitResult.startY,
            radius,
            type: "selector",
          });
          this.shapeSelectors.push({
            id: 2,
            centerX: hitResult.endX,
            centerY: hitResult.endY,
            radius,
            type: "selector",
          });
        }
      }
      this.clearCanvas();
    }
  };

  updateSelectors = (shape: Shape) => {
    if (shape.type === "rect") {
      const radius = 6;
      this.shapeSelectors = [];
      this.shapeSelectors.push({
        id: 1,
        centerX: shape.startX,
        centerY: shape.startY,
        radius,
        type: "selector",
      });
      this.shapeSelectors.push({
        id: 2,
        centerX: shape.startX + shape.width,
        centerY: shape.startY,
        radius,
        type: "selector",
      });
      this.shapeSelectors.push({
        id: 3,
        centerX: shape.startX + shape.width,
        centerY: shape.startY + shape.height,
        radius,
        type: "selector",
      });
      this.shapeSelectors.push({
        id: 4,
        centerX: shape.startX,
        centerY: shape.startY + shape.height,
        radius,
        type: "selector",
      });
    } else if (shape.type === "circle") {
      const radius = 6;
      this.shapeSelectors = [];
      this.shapeSelectors.push({
        id: 1,
        centerX: shape.centerX,
        centerY: shape.centerY,
        radius,
        type: "selector",
      });
    } else if (shape.type === "line") {
      const radius = 6;
      this.shapeSelectors = [];
      this.shapeSelectors.push({
        id: 1,
        centerX: shape.startX,
        centerY: shape.startY,
        radius,
        type: "selector",
      });
      this.shapeSelectors.push({
        id: 2,
        centerX: shape.endX,
        centerY: shape.endY,
        radius,
        type: "selector",
      });
    }
  };

  hitTest = (x: number, y: number) => {
    for (let i = 0; i < this.shapeSelectors.length; i++) {
      const selectorId = i + 1;
      const selector = this.shapeSelectors[selectorId - 1];
      const dist = Math.sqrt(
        (x - selector.centerX) ** 2 + (y - selector.centerY) ** 2
      );
      if (dist <= selector.radius) {
        return selector;
      }
    }
    for (let i = this.existingShapes.length - 1; i >= 0; i--) {
      const shape = this.existingShapes[i];
      if (shape.type === "rect") {
        if (
          x >= shape.startX &&
          x <= shape.startX + shape.width &&
          y >= shape.startY &&
          y <= shape.startY + shape.height
        ) {
          return shape;
        }
      } else if (shape.type === "circle") {
        const dist = Math.sqrt(
          (x - shape.centerX) ** 2 + (y - shape.centerY) ** 2
        );
        if (dist <= shape.radius) {
          return shape;
        }
      } else if (shape.type === "line") {
        const x1 = shape.startX;
        const y1 = shape.startY;
        const x2 = shape.endX;
        const y2 = shape.endY;

        const A = x - x1;
        const B = y - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) {
          param = dot / len_sq;
        }

        let xx, yy;

        if (param < 0) {
          xx = x1;
          yy = y1;
        } else if (param > 1) {
          xx = x2;
          yy = y2;
        } else {
          xx = x1 + param * C;
          yy = y1 + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 5) {
          // 5 is the tolerance
          return shape;
        }
      }
    }
    return null;
  };

  initHandlers = () => {
    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type == "shape created") {
        const shape = {
          id: data.shape.id,
          ...data.shape.shape,
        };
        this.existingShapes.push(shape);
        this.clearCanvas();
      }

      if (data.type === "shape_updated") {
        const shape = this.existingShapes.find(
          (s) => s.type != "pointer" && s.id === data.shape.id
        );
        if (shape) {
          const updatedShape = JSON.parse(data.shape.shape);
          Object.assign(shape, updatedShape);
          this.clearCanvas();
        }
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

    this.canvas.addEventListener("click", this.mouseClickHandler);
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
      return data;
    } catch (e) {
      console.log(e);
    }
  };

  clearCanvas = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.existingShapes.length > 0) {
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

      if (this.shapeSelectors.length > 0 && this.selectedShape) {
        this.shapeSelectors.forEach((selector) => {
          // const radius = 8
          if (this.selectedShape?.type === "circle") {
            this.ctx.beginPath();
            this.ctx.arc(
              selector.centerX,
              selector.centerY,
              selector.radius,
              0,
              2 * Math.PI
            );
            this.ctx.stroke();
          } else if (this.selectedShape?.type === "rect") {
            this.ctx.beginPath();
            this.ctx.arc(
              selector.centerX,
              selector.centerY,
              selector.radius,
              0,
              2 * Math.PI
            );
            this.ctx.stroke();
          } else if (this.selectedShape?.type === "line") {
            this.ctx.beginPath();
            this.ctx.arc(
              selector.centerX,
              selector.centerY,
              selector.radius,
              0,
              2 * Math.PI
            );
            this.ctx.stroke();
          }
        });
      }
    }
  };

  destroy = () => {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("click", this.mouseClickHandler);
  };
}
