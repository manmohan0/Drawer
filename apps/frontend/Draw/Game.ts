import { BACKEND_URL } from "@/config";
import { selector, Shape, ShapeType } from "@/types";
import axios from "axios";

/**
 * The `Game` class manages the collaborative whiteboard engine.
 * It coordinates canvas rendering, viewport manipulation (zooming, panning),
 * mouse/keyboard event handling, local shape drawing/editing, and syncs 
 * state transitions in real-time with other clients via a WebSocket connection.
 */
export class Game {
  // Unique identifier for the collaborative drawing room
  private roomId: string;
  // WebSocket socket connection for real-time synchronization of drawing actions
  private ws: WebSocket;
  // The HTML5 Canvas element instance
  private canvas: HTMLCanvasElement;
  // 2D rendering context of the canvas
  private ctx: CanvasRenderingContext2D;
  // Collection of shapes downloaded from the database or received via WebSocket messages
  private existingShapes: Shape[];
  // Track whether the primary mouse button is currently held down
  private isClicked: boolean;
  // X-coordinate of the mouse cursor when a drag or draw interaction starts
  private startX: number = 0;
  // Y-coordinate of the mouse cursor when a drag or draw interaction starts
  private startY: number = 0;
  // Current horizontal translation (panning offset) of the canvas viewport
  private panX: number = 0;
  // Current vertical translation (panning offset) of the canvas viewport
  private panY: number = 0;
  // Flag indicating if viewport panning mode (activated by holding Spacebar) is active
  private isPan: boolean = false;
  // The active tool selected in the toolbar (e.g., 'rect', 'circle', 'line', 'pointer')
  private selectedTool: ShapeType = "rect";
  // The shape instance currently selected for editing/moving when using the pointer tool
  private selectedShape: Shape | null = null;
  // Array of bounding box handles (control points) used to resize/modify the selected shape
  private shapeSelectors: selector[] = [];
  // The specific selector handle being dragged, or null if not dragging any handle
  private draggedSelector: selector | null = null;
  // Copy of the selected shape state when a drag/resize action begins (to compute relative delta changes)
  private originalShape: Shape | null = null;
  // Current zoom level of the viewport (default is 1x scale)
  private zoom: number = 1;
  // Cache for loaded images to draw them synchronously
  private imageCache: Map<string, HTMLImageElement> = new Map();

  /**
   * Initializes the Game whiteboard session.
   * @param canvas The target canvas element to draw on.
   * @param roomId The unique room ID representing the drawing session.
   * @param ws The established WebSocket connection to sync room updates.
   */
  constructor(canvas: HTMLCanvasElement, roomId: string, ws: WebSocket) {
    this.canvas = canvas;
    this.roomId = roomId;
    this.ws = ws;
    this.ctx = canvas.getContext("2d")!;
    this.existingShapes = [];
    this.isClicked = false;

    // Initialize state, load existing shapes, set up event listeners, and clear the screen
    this.init();
    this.initHandlers();
    this.initMouseHandlers();
    this.initKeyboardHandlers();
  };

  /**
   * Sets the active drawing tool.
   * @param tool The name of the tool to activate ('rect', 'circle', 'line', 'pointer').
   */
  setTool = (tool: ShapeType) => {
    this.selectedTool = tool;
  };

  /**
   * Gets the currently active drawing tool.
   * @returns The active ShapeType.
   */
  getTool = () => {
    return this.selectedTool;
  };

  /**
   * Translates viewport-relative screen coordinates to zoom/pan-independent world coordinates.
   * This is critical to ensure shapes are drawn at the correct coordinates regardless of current zoom level or pan offsets.
   * 
   * @param e Mouse event containing raw viewport client coordinates.
   * @returns Object containing the calculated coordinates {x, y} in the game world space.
   */
  getMousePos = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    // 1. Convert client coordinates to canvas-relative coordinates
    // 2. Subtract the pan offsets to align with the translated viewport origin
    // 3. Divide by the zoom factor to scale correctly based on current zoom level
    const x = (e.clientX - rect.left - this.panX) / this.zoom;
    const y = (e.clientY - rect.top - this.panY) / this.zoom;
    return { x, y };
  };

  /**
   * Retrieves an image from the cache if loaded, or starts loading it.
   * Triggers a canvas redraw once the image finishes loading.
   * 
   * @param src The source URL of the image.
   * @returns The HTMLImageElement if loaded, or null if still loading.
   */
  private getImage = (src: string): HTMLImageElement | null => {
    if (this.imageCache.has(src)) {
      const img = this.imageCache.get(src)!;
      if (img.complete) {
        return img;
      }
      return null;
    }

    const img = new Image();
    img.onload = () => {
      this.clearCanvas();
    };
    img.onerror = (err) => {
      console.error(`[getImage error] Failed to load ${src}`, err);
    };
    img.src = src;
    this.imageCache.set(src, img);
    return null;
  };

  /**
   * Calculates the aspect ratio of the image.
   * If the image is loaded, returns its natural aspect ratio.
   * Otherwise, falls back to 1.0 (square).
   * 
   * @param src The source URL of the image.
   * @returns Aspect ratio as a number.
   */
  private getImageAspectRatio = (src: string): number => {
    const img = this.getImage(src);
    if (img && img.naturalWidth && img.naturalHeight) {
      return img.naturalWidth / img.naturalHeight;
    }
    return 1;
  };

  /**
   * Prompts the user to select an image file, converts it to base64,
   * updates the shape URL, and broadcasts the update via WebSocket.
   * 
   * @param shape The image shape to update.
   */
  private triggerImageUpload = (shape: Shape) => {
    if (shape.type !== "image") return;

    // 1. Create a dynamic off-screen HTML5 file input element in browser memory
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    // 2. Set up the file selection change handler
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // 3. Enforce a 5MB size limit to prevent WebSocket frame lag and backend bloating
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        alert("File is too large. Maximum file size is 5MB");
        return;
      }

      const fileReader = new FileReader();
      fileReader.onload = () => {
        const base64Url = fileReader.result as string;
        if (!base64Url) return;
        shape.url = base64Url;
        this.clearCanvas();
        this.ws.send(
          JSON.stringify({
            type: "update_shape",
            room: this.roomId,
            shapeId: shape.id || -1,
            shape: JSON.stringify(shape),
          })
        );
      };
      fileReader.readAsDataURL(file);
    };

    // 9. Programmatically click the hidden input to open the native system file selector
    input.click();
  };

  /**
   * Handles the 'mousedown' event.
   * Responsible for initiating drawing, entering viewport pan mode, selecting shapes, 
   * or picking resize selectors/handles for shape manipulation.
   */
  mouseDownHandler = (e: MouseEvent) => {
    this.isClicked = true;
    const { x, y } = this.getMousePos(e);
    this.startX = x;
    this.startY = y;

    // Pointer tool logic: Determine if the user is clicking a control handle or a shape
    if (this.selectedTool === "pointer") {
      const hit = this.hitTest(x, y);

      // Store a deep copy of the selected shape configuration to track offset modifications accurately
      this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));

      if (hit && hit.type === "selector" && this.selectedShape) {
        // User clicked directly on a resize selector handle
        this.draggedSelector = hit;
      } else {
        // User did not click a selector handle
        this.draggedSelector = null;
      }
    }
  };

  /**
   * Handles the 'mousemove' event.
   * Manages active viewport panning, rendering drawing previews, dragging/resizing shapes, 
   * and dragging complete shapes across the canvas coordinate space.
   */
  mouseMoveHandler = (e: MouseEvent) => {
    // If the pan mode is active (activated via spacebar), adjust the pan offset relative to screen translation
    if (this.isPan && this.isClicked) {
      this.panX += e.movementX;
      this.panY += e.movementY;
      this.clearCanvas();
      return;
    }

    const { x: currentX, y: currentY } = this.getMousePos(e);

    // Dynamic drawing preview logic (only runs while dragging and when not in selection mode or panning mode)
    if (
      this.isClicked &&
      this.selectedTool !== "pointer" &&
      !this.selectedShape &&
      !this.isPan
    ) {
      const width = currentX - this.startX;
      const height = currentY - this.startY;

      // Redraw canvas to render the updated shape preview coordinates
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
        this.ctx.arc(this.startX, this.startY, radius, 0, 2 * Math.PI);
        this.ctx.stroke();
      } else if (this.selectedTool === "image") {
        this.ctx.save();
        this.ctx.setLineDash([10, 5]);
        const aspectRatio = this.getImageAspectRatio("/add-image.png");
        let drawWidth = width;
        let drawHeight = height;
        if (Math.abs(width) > Math.abs(height) * aspectRatio) {
          drawWidth = Math.sign(width) * Math.abs(height) * aspectRatio;
        } else {
          drawHeight = Math.sign(height) * Math.abs(width) / aspectRatio;
        }
        this.ctx.strokeRect(this.startX, this.startY, drawWidth, drawHeight);
        this.ctx.strokeRect(this.startX + drawWidth / 3, this.startY + drawHeight / 3, drawWidth / 3, drawHeight / 3);
        const img = this.getImage("/add-image.png");
        if (img) {
          this.ctx.drawImage(img, this.startX + drawWidth / 3, this.startY + drawHeight / 3, drawWidth / 3, drawHeight / 3);
        }
        this.ctx.restore();
      }
    }

    // Editing mode logic: Resizing or moving selected shapes
    if (this.isClicked && this.selectedShape && this.originalShape && !this.isPan) {
      const deltaX = currentX - this.startX;
      const deltaY = currentY - this.startY;

      if (this.draggedSelector) {
        // CASE A: Dragging a specific resize handle
        if (
          (this.selectedShape.type === "rect" || this.selectedShape.type === "image") &&
          (this.originalShape.type === "rect" || this.originalShape.type === "image")
        ) {
          const originalRect = this.originalShape;
          const rect = this.selectedShape;
          const selectorId = this.draggedSelector.id;

          // Resize rect using the specific corner handle index (1 to 4)
          if (rect.type === "image" && originalRect.type === "image") {
            const originalWidth = originalRect.width;
            const originalHeight = originalRect.height;
            const aspectRatio = originalWidth / originalHeight || 1;

            switch (selectorId) {
              case 1: { // Top-left corner
                const maxDelta = Math.abs(deltaX) > Math.abs(deltaY) * aspectRatio ? deltaX : deltaY * aspectRatio;
                rect.width = originalWidth - maxDelta;
                rect.height = originalHeight - maxDelta / aspectRatio;
                rect.startX = originalRect.startX + maxDelta;
                rect.startY = originalRect.startY + maxDelta / aspectRatio;
                break;
              }
              case 2: { // Top-right corner
                const maxDelta = Math.abs(deltaX) > Math.abs(deltaY) * aspectRatio ? deltaX : -deltaY * aspectRatio;
                rect.width = originalWidth + maxDelta;
                rect.height = originalHeight + maxDelta / aspectRatio;
                rect.startY = originalRect.startY - maxDelta / aspectRatio;
                break;
              }
              case 3: { // Bottom-right corner
                const maxDelta = Math.abs(deltaX) > Math.abs(deltaY) * aspectRatio ? deltaX : deltaY * aspectRatio;
                rect.width = originalWidth + maxDelta;
                rect.height = originalHeight + maxDelta / aspectRatio;
                break;
              }
              case 4: { // Bottom-left corner
                const maxDelta = Math.abs(deltaX) > Math.abs(deltaY) * aspectRatio ? -deltaX : deltaY * aspectRatio;
                rect.width = originalWidth + maxDelta;
                rect.height = originalHeight + maxDelta / aspectRatio;
                rect.startX = originalRect.startX - maxDelta;
                break;
              }
            }
          } else {
            switch (selectorId) {
              case 1: // Top-left corner
                rect.startX = originalRect.startX + deltaX;
                rect.startY = originalRect.startY + deltaY;
                rect.width = originalRect.width - deltaX;
                rect.height = originalRect.height - deltaY;
                break;
              case 2: // Top-right corner
                rect.startY = originalRect.startY + deltaY;
                rect.width = originalRect.width + deltaX;
                rect.height = originalRect.height - deltaY;
                break;
              case 3: // Bottom-right corner
                rect.width = originalRect.width + deltaX;
                rect.height = originalRect.height + deltaY;
                break;
              case 4: // Bottom-left corner
                rect.startX = originalRect.startX + deltaX;
                rect.width = originalRect.width - deltaX;
                rect.height = originalRect.height + deltaY;
                break;
            }
          }

          this.updateSelectors(rect);
          this.clearCanvas();
        } else if (
          this.selectedShape.type === "circle" &&
          this.originalShape.type === "circle"
        ) {
          const circle = this.selectedShape;
          const originalCircle = this.originalShape;

          // Resize circle by adjusting the radius relative to delta moves
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

          // Modify start point or end point coordinates of the line segment
          switch (selectorId) {
            case 1: // Start point
              line.startX = originalLine.startX + deltaX;
              line.startY = originalLine.startY + deltaY;
              break;
            case 2: // End point
              line.endX = originalLine.endX + deltaX;
              line.endY = originalLine.endY + deltaY;
              break;
          }

          this.updateSelectors(line);
        }
      } else {
        // CASE B: Moving the entire shape (dragging by body rather than selectors)
        if (
          (this.selectedShape.type === "rect" || this.selectedShape.type === "image") &&
          (this.originalShape.type === "rect" || this.originalShape.type === "image")
        ) {
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

  /**
   * Handles the 'mouseup' event.
   * Commits the finalized drawing geometry or finalized shape adjustments and pushes the changes
   * to the backend WebSocket channel so other users see updates in real time.
   */
  mouseUpHandler = (e: MouseEvent) => {
    if (this.isPan) {
      this.isClicked = false;
      return;
    }

    // If we were resizing or moving an existing shape, push the update to the server
    if (this.draggedSelector) {
      this.isClicked = false;

      let shapeId: number = -1;
      if (this.selectedShape?.type != "pointer" && this.selectedShape?.id) {
        shapeId = this.selectedShape?.id;
      }

      if (this.selectedShape && (this.selectedShape.type === "rect" || this.selectedShape.type === "image")) {
        const rect = this.selectedShape;
        if (rect.width < 0) {
          rect.startX = rect.startX + rect.width;
          rect.width = Math.abs(rect.width);
        }
        if (rect.height < 0) {
          rect.startY = rect.startY + rect.height;
          rect.height = Math.abs(rect.height);
        }
        this.updateSelectors(rect);
      }

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
    const { x: currentX, y: currentY } = this.getMousePos(e);

    const width = currentX - this.startX;
    const height = currentY - this.startY;

    // Map the local mouse release geometry into a new Shape payload
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
        startX: width >= 0 ? this.startX : this.startX + width,
        startY: height >= 0 ? this.startY : this.startY + height,
        width: Math.abs(width),
        height: Math.abs(height),
      };
    } else if (this.selectedTool === "circle") {
      shape = {
        type: this.selectedTool,
        centerX: this.startX,
        centerY: this.startY,
        radius: Math.sqrt(width * width + height * height),
      };
    } else if (this.selectedTool === "image") {
      const aspectRatio = this.getImageAspectRatio("/add-image.png");
      let drawWidth = width;
      let drawHeight = height;
      if (Math.abs(width) > Math.abs(height) * aspectRatio) {
        drawWidth = Math.sign(width) * Math.abs(height) * aspectRatio;
      } else {
        drawHeight = Math.sign(height) * Math.abs(width) / aspectRatio;
      }
      shape = {
        type: this.selectedTool,
        url: "",
        startX: drawWidth >= 0 ? this.startX : this.startX + drawWidth,
        startY: drawHeight >= 0 ? this.startY : this.startY + drawHeight,
        width: Math.abs(drawWidth),
        height: Math.abs(drawHeight),
      };
    } else {
      return; // Pointer or other tools don't create new shapes
    }

    // Broadcast the newly created shape details via WebSocket
    this.ws.send(
      JSON.stringify({
        type: "chat",
        roomId: this.roomId,
        shape: JSON.stringify(shape),
      })
    );
  };

  /**
   * Handles the 'click' event.
   * Manages shape selection when using the "pointer" tool. Computes what item (shape or selector handle) 
   * was clicked and spawns the resize handle overlays.
   */
  mouseClickHandler = (e: MouseEvent) => {
    if (this.selectedTool === "pointer") {
      const { x, y } = this.getMousePos(e);
      const hitResult = this.hitTest(x, y);

      if (!hitResult) {
        // Clicked on empty canvas space -> Deselect currently selected shape
        this.selectedShape = null;
        this.shapeSelectors = [];
      } else if (hitResult.type === "selector") {
        // Clicked on a resize handle selector -> Selection state remains unchanged
      } else {
        // Clicked on a shape body -> Set selection and build corresponding resize handle coordinates
        this.selectedShape = hitResult;

        // Check if clicked inside the middle 1/3 of an image placeholder shape to trigger upload
        if (hitResult.type === "image" && !hitResult.url) {
          const midXMin = hitResult.startX + hitResult.width / 3;
          const midXMax = hitResult.startX + (2 * hitResult.width) / 3;
          const midYMin = hitResult.startY + hitResult.height / 3;
          const midYMax = hitResult.startY + (2 * hitResult.height) / 3;

          if (x >= midXMin && x <= midXMax && y >= midYMin && y <= midYMax) {
            this.triggerImageUpload(hitResult);
            this.clearCanvas();
            return;
          }
        }

        if (hitResult.type === "rect" || hitResult.type === "image") {
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

  /**
   * Handles the mouse 'wheel' event.
   * Performs responsive zooming aligned directly towards the user's cursor location.
   */
  mouseWheelHandler = (e: WheelEvent) => {
    e.preventDefault(); // Stop native page scroll action
    const scaleFactor = 1 - e.deltaY * 0.001; // Scale factor based on wheel scroll delta
    const newZoom = this.zoom * scaleFactor;

    // Enforce zoom constraints (clamp values between 0.5x minimum and 5x maximum zoom)
    if (newZoom < 0.5 || newZoom > 5) return;

    // Zoom-to-Cursor Algorithm:
    // 1. Calculate the cursor's world space coordinate prior to updating the zoom value
    const { x: mouseWorldX, y: mouseWorldY } = this.getMousePos(e);

    // 2. Commit the new zoom scale
    this.zoom = newZoom;

    // 3. Adjust the pan coordinates so that the cursor stays on top of the exact same world coordinate.
    // The screen client coordinates of the mouse have not changed:
    const rect = this.canvas.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    // Calculate new pan positions: ScreenPosition - (WorldPosition * Zoom)
    this.panX = mouseScreenX - mouseWorldX * this.zoom;
    this.panY = mouseScreenY - mouseWorldY * this.zoom;

    this.clearCanvas();
  };

  /**
   * Handles the keyboard 'keydown' event.
   * Activates pan mode when the Spacebar key is depressed.
   */
  keyboardDownHandler = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      this.isPan = true;
    }
  };

  /**
   * Handles the keyboard 'keyup' event.
   * Deactivates pan mode when the Spacebar key is released.
   */
  keyboardUpHandler = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      this.isPan = false;
    }
  };

  oneTimeKeyboardPressHandler = (e: KeyboardEvent) => {
    if (e.repeat) return;
    console.log(e.key)
    if (e.key === 'Delete') {
      if (this.selectedShape) {
        this.deleteSelectedShape();
      }
    }
  };

  deleteSelectedShape = () => {
    if (!this.selectedShape || this.selectedShape.type === "pointer") return;
    this.ws.send(
      JSON.stringify({
        type: "delete_shape",
        room: this.roomId,
        shapeId: this.selectedShape.id || -1,
      })
    );
    // this.existingShapes = this.existingShapes.filter((shape) => (shape.type !== "pointer" && shape.id) !== (this.selectedShape!.type !== "pointer" && this.selectedShape!.id));
    // this.selectedShape = null;
    // this.clearCanvas();
  };
  /**
   * Dynamically constructs the interactive resize handles (selectors) for the selected shape.
   * Handlers scale inverse to the zoom level so they remain visually legible at different zoom levels.
   * 
   * @param shape The shape currently selected.
   */
  updateSelectors = (shape: Shape) => {
    if (shape.type === "rect" || shape.type === "image") {
      const radius = 6;
      this.shapeSelectors = [];
      // Top-Left handle
      this.shapeSelectors.push({
        id: 1,
        centerX: shape.startX,
        centerY: shape.startY,
        radius: radius / this.zoom,
        type: "selector",
      });
      // Top-Right handle
      this.shapeSelectors.push({
        id: 2,
        centerX: shape.startX + shape.width,
        centerY: shape.startY,
        radius: radius / this.zoom,
        type: "selector",
      });
      // Bottom-Right handle
      this.shapeSelectors.push({
        id: 3,
        centerX: shape.startX + shape.width,
        centerY: shape.startY + shape.height,
        radius: radius / this.zoom,
        type: "selector",
      });
      // Bottom-Left handle
      this.shapeSelectors.push({
        id: 4,
        centerX: shape.startX,
        centerY: shape.startY + shape.height,
        radius: radius / this.zoom,
        type: "selector",
      });
    } else if (shape.type === "circle") {
      const radius = 6;
      this.shapeSelectors = [];
      // Single center-positioned handle for circles
      this.shapeSelectors.push({
        id: 1,
        centerX: shape.centerX,
        centerY: shape.centerY,
        radius: radius / this.zoom,
        type: "selector",
      });
    } else if (shape.type === "line") {
      const radius = 6;
      this.shapeSelectors = [];
      // Handle at line start coordinate
      this.shapeSelectors.push({
        id: 1,
        centerX: shape.startX,
        centerY: shape.startY,
        radius: radius / this.zoom,
        type: "selector",
      });
      // Handle at line end coordinate
      this.shapeSelectors.push({
        id: 2,
        centerX: shape.endX,
        centerY: shape.endY,
        radius: radius / this.zoom,
        type: "selector",
      });
    }
  };

  /**
   * Hit detection engine.
   * Resolves whether the click coordinates (x, y) intersect with a selector handle or any existing shape.
   * Iterates shapes in reverse chronological order (top-most layer first).
   * 
   * @param x World coordinate x.
   * @param y World coordinate y.
   * @returns The intersected selector or shape object, or null if nothing was clicked.
   */
  hitTest = (x: number, y: number) => {
    // 1. Check intersection with selector handles (high-priority check)
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

    // 2. Check intersection with drawing shapes (from topmost down to bottommost)
    for (let i = this.existingShapes.length - 1; i >= 0; i--) {
      const shape = this.existingShapes[i];

      if (shape.type === "rect" || shape.type === "image") {
        // Point-in-rectangle check (handles negative width and height correctly)
        const xMin = Math.min(shape.startX, shape.startX + shape.width);
        const xMax = Math.max(shape.startX, shape.startX + shape.width);
        const yMin = Math.min(shape.startY, shape.startY + shape.height);
        const yMax = Math.max(shape.startY, shape.startY + shape.height);
        if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
          return shape;
        }
      } else if (shape.type === "circle") {
        // Distance check: Point distance from circle origin must be <= radius
        const dist = Math.sqrt(
          (x - shape.centerX) ** 2 + (y - shape.centerY) ** 2
        );
        if (dist <= shape.radius) {
          return shape;
        }
      } else if (shape.type === "line") {
        // Closest-point-on-line-segment check using projection:
        const x1 = shape.startX;
        const y1 = shape.startY;
        const x2 = shape.endX;
        const y2 = shape.endY;

        const A = x - x1; // Vector from start point to test coordinates
        const B = y - y1;
        const C = x2 - x1; // Vector of the line segment path
        const D = y2 - y1;

        const dot = A * C + B * D; // Dot product
        const len_sq = C * C + D * D; // Squared length of line segment

        let param = -1;
        if (len_sq != 0) {
          param = dot / len_sq; // Projected scalar value along line segment
        }

        let xx, yy;

        // Clamp the projected point coordinate directly on the segment boundary
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

        // Define hit-test tolerance of 5 pixels (makes clicking line elements easier)
        if (distance < 5) {
          return shape;
        }
      }
    }
    return null;
  };

  /**
   * Sets up real-time listener handlers on the active WebSocket connection.
   * Listens for remote updates such as shape creation, modifications, or room clears.
   */
  initHandlers = () => {
    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      // Remote user created a shape
      if (data.type == "shape created") {
        const shape = {
          id: data.shape.id,
          ...data.shape.shape,
        };
        this.existingShapes.push(shape);
        this.clearCanvas();
      }

      // Remote user modified a shape
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

      if (data.type === "shape_deleted") {
        const shape = this.existingShapes.find((s) => s.type !== "pointer" && s.id === data.shapeId);
        if (shape) {
          this.existingShapes = this.existingShapes.filter((s) => s.type !== "pointer" && s.id !== data.shapeId);
          this.selectedShape = null;
          this.shapeSelectors = [];
          this.clearCanvas();
        }
      }

      // Remote user cleared the canvas
      if (data.type == "cleared") {
        this.existingShapes = [];
        this.clearCanvas();
      }
    };
  };

  /**
   * Initializes the whiteboard engine state.
   * Resolves existing shapes, resizes the canvas window viewport, 
   * sets the drawing styles, and sets up window resize listeners.
   */
  init = async () => {
    if (!this.ctx) return;

    // Fetch existing shape lists from room database history
    this.existingShapes = await this.getExistingShapes(this.roomId) || [];

    this.updateCanvasSize();
    this.ctx.lineWidth = 2; // Fixed stroke thickness

    // Register dynamic resize listener to maintain correct canvas proportions
    window.addEventListener("resize", () => {
      this.updateCanvasSize();
    });
    this.clearCanvas();
  };

  /**
   * Sets canvas dimensions and handles High-DPI screens correctly.
   * Prevents canvas drawings from looking blurry or pixelated on screens like Retina displays.
   */
  updateCanvasSize = () => {
    const dpr = window.devicePixelRatio || 1;
    // Set actual render resolution buffer sizing
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    // Keep canvas elements constrained within display boundaries
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.clearCanvas();
  };

  /**
   * Registers mouse event listeners onto the Canvas element.
   */
  initMouseHandlers = () => {
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
    this.canvas.addEventListener("click", this.mouseClickHandler);
    this.canvas.addEventListener("wheel", this.mouseWheelHandler);
  };

  /**
   * Registers keyboard event listeners onto the global window scope.
   */
  initKeyboardHandlers = () => {
    window.addEventListener("keydown", this.keyboardDownHandler);
    window.addEventListener("keyup", this.keyboardUpHandler);
    window.addEventListener("keydown", this.oneTimeKeyboardPressHandler)
  };

  /**
   * Fetches room drawings from the database through REST HTTP calls.
   * 
   * @param canvasId The database room target ID.
   * @returns Array of database shape elements or undefined on error.
   */
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

  /**
   * Primary render loop.
   * Resets transformations, clears viewport bounding rectangles,
   * scales matching device pixels to avoid pixelation, translates coordinates according
   * to user panning offsets, scales matching camera zooms, and renders all visible shapes.
   */
  clearCanvas = () => {
    // 1. Reset current context transform matrix to identity for a clean viewport clear
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const dpr = window.devicePixelRatio || 1;

    // 2. Order of transformations:
    // Scale for Device Pixel Ratio first (physical dimensions adjust to logical screen coordinates)
    this.ctx.scale(dpr, dpr);
    // Apply layout pan (translates virtual camera horizontally and vertically)
    this.ctx.translate(this.panX, this.panY);
    // Apply zoom (scales coordinates outward around origin)
    this.ctx.scale(this.zoom, this.zoom);

    // 3. Render all existing shapes loaded in memory
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
        } else if (shape.type === "image") {
          this.ctx.save();
          if (shape.url) {
            const img = this.getImage(shape.url);
            if (img) {
              this.ctx.drawImage(img, shape.startX, shape.startY, shape.width, shape.height);
            } else {
              this.ctx.setLineDash([10, 5]);
              this.ctx.strokeRect(shape.startX, shape.startY, shape.width, shape.height);
            }
          } else {
            this.ctx.setLineDash([10, 5]);
            this.ctx.strokeRect(shape.startX, shape.startY, shape.width, shape.height);
            this.ctx.strokeRect(shape.startX + shape.width / 3, shape.startY + shape.height / 3, shape.width / 3, shape.height / 3);
            const img = this.getImage("/add-image.png");
            if (img) {
              this.ctx.drawImage(img, shape.startX + shape.width / 3, shape.startY + shape.height / 3, shape.width / 3, shape.height / 3);
            }
          }
          this.ctx.restore();
        }
      });

      // 4. Render control handles overlay if a shape is selected in pointer mode
      if (this.shapeSelectors.length > 0 && this.selectedShape) {
        this.shapeSelectors.forEach((selector) => {
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
          } else if (this.selectedShape?.type === "rect" || this.selectedShape?.type === "image") {
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

  /**
   * Cleans up canvas event listeners and window keyboard listeners.
   * Prevents memory leaks when the component mounts and unmounts in web applications.
   */
  destroy = () => {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("click", this.mouseClickHandler);
    this.canvas.removeEventListener("wheel", this.mouseWheelHandler);
    this.canvas.removeEventListener("keydown", this.keyboardDownHandler);
    this.canvas.removeEventListener("keyup", this.keyboardUpHandler);
    this.canvas.removeEventListener("keydown", this.oneTimeKeyboardPressHandler);
  };
}
