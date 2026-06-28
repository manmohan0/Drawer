import { BACKEND_URL } from "@/config";
import { HistoryAction, role, selector, Shape, ShapeType } from "@/types";
import axios from "axios";
import { EventType } from "@repo/common/enum";

const ROTATE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

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
  private tempShapes: Shape[] = [];
  private replayShapes: Shape[] | null = null;
  private selectedColor: string = "#ffffff";
  // Track whether the primary mouse button is currently held down
  private isClicked: boolean;
  // X-coordinate of the mouse cursor when a drag or draw interaction starts
  private startX: number = 0;
  // Y-coordinate of the mouse cursor when a drag or draw interaction starts
  private startY: number = 0;
  // Current horizontal translation (panning offset) of the canvas viewport
  public panX: number = 0;
  // Current vertical translation (panning offset) of the canvas viewport
  public panY: number = 0;
  // Flag indicating if viewport panning mode (activated by holding Spacebar) is active
  private isPan: boolean = false;
  // The active tool selected in the toolbar (e.g., 'rectangle', 'circle', 'line', 'pointer')
  private selectedTool: ShapeType = "rectangle";
  // The shape instance currently selected for editing/moving when using the pointer tool
  private selectedShape: Shape | null = null;
  // Array of bounding box handles (control points) used to resize/modify the selected shape
  private shapeSelectors: selector[] = [];
  private rotateIconLocation: { x: number; y: number } | null = null;
  private rotateImg: HTMLImageElement | null;
  private isRotating: boolean = false;
  private focusAnimationId: number | null = null;
  private coordinateUpdateTimeout: any = null;
  // The specific selector handle being dragged, or null if not dragging any handle
  private draggedSelector: selector | null = null;
  // Copy of the selected shape state when a drag/resize action begins (to compute relative delta changes)
  private originalShape: Shape | null = null;
  // Current zoom level of the viewport (default is 1x scale)
  public zoom: number = 1;
  // Cache for loaded images to draw them synchronously
  private imageCache: Map<string, HTMLImageElement> = new Map();
  //map of userIds and their details
  private users: Record<string, { firstName: string; lastName: string }> = {};
  private myUserId: string | null = null;
  private myRole: role | null = null;
  // Stacks to store the history of shapes that can be undone/redone
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];

  private clipboardShape: Shape | null = null;
  private lastMouseWorldX: number = 0;
  private lastMouseWorldY: number = 0;
  // Map to track asynchronous shape recreations by their temporary transaction IDs
  private pendingHistoryMap: Map<string, HistoryAction> = new Map();
  private isUndoingRedoing: boolean = false;
  // A list of callback listeners to notify React when the stacks update
  private onHistoryChangeCallbacks: Set<() => void> = new Set();
  private lastTriggeredPanX = 0;
  private lastTriggeredPanY = 0;
  private lastTriggeredZoom = 1;
  private onViewportChangeCallbacks: Set<() => void> = new Set();

  private onSelectionChange?: (shape: Shape | null) => void;
  public onMouseMove?: (x: number, y: number) => void;
  public onRoleChange?: (role: role) => void;
  public editingTextShapeId: number | undefined;
  public onStartTextEdit?: (
    x: number,
    y: number,
    text: string,
    fontSize: number,
    onSave: (val: string) => void,
    onCancel: () => void,
  ) => void;
  public onRoomJoined?: (
    myUserId: string,
    users: Record<string, { firstName: string; lastName: string }>,
  ) => void;

  /**
   * Initializes the Game whiteboard session.
   * @param canvas The target canvas element to draw on.
   * @param roomId The unique room ID representing the drawing session.
   * @param ws The established WebSocket connection to sync room updates.
   * @param onSelectionChange Optional callback invoked when the selected shape changes or is edited.
   */
  constructor(
    canvas: HTMLCanvasElement,
    roomId: string,
    ws: WebSocket,
    onSelectionChange?: (shape: Shape | null) => void,
  ) {
    this.canvas = canvas;
    this.roomId = roomId;
    this.ws = ws;
    this.onSelectionChange = onSelectionChange;
    this.ctx = canvas.getContext("2d")!;
    this.existingShapes = [];
    this.tempShapes = [];
    this.isClicked = false;
    this.rotateImg = new Image();
    this.rotateImg.src = ROTATE_SVG;

    // Initialize state, load existing shapes, set up event listeners, and clear the screen
    this.init();
    this.initHandlers();
    this.initMouseHandlers();
    this.initKeyboardHandlers();
  }

  /**
   * Sets the active drawing tool.
   * @param tool The name of the tool to activate ('rectangle', 'circle', 'line', 'pointer').
   */
  setTool = (tool: ShapeType) => {
    this.selectedTool = tool;
    if (tool !== "pointer" && this.selectedShape) {
      this.selectedShape = null;
      this.shapeSelectors = [];
      this.rotateIconLocation = null;
      this.clearCanvas();
      this.triggerSelectionChange();
    }
  };

  /**
   * Gets the currently active drawing tool.
   * @returns The active ShapeType.
   */
  getTool = () => {
    return this.selectedTool;
  };

  setMyRole = (role: role) => {
    this.myRole = role;
  };

  screenToWorld = (screenX: number, screenY: number) => {
    return {
      x: (screenX - this.panX) / this.zoom,
      y: (screenY - this.panY) / this.zoom,
    };
  };

  // World -> Screen (e.g., to calculate selector borders on screen)
  worldToScreen = (worldX: number, worldY: number) => {
    return {
      x: worldX * this.zoom + this.panX,
      y: worldY * this.zoom + this.panY,
    };
  };

  // Subscribes a React component to stack changes
  public subscribeHistoryChange(callback: () => void) {
    this.onHistoryChangeCallbacks.add(callback);
    return () => {
      this.onHistoryChangeCallbacks.delete(callback);
    };
  }

  // Calls all registered callbacks to force React components to re-render
  private triggerHistoryChange() {
    this.onHistoryChangeCallbacks.forEach((cb) => cb());
  }

  public subscribeViewportChange(callback: () => void) {
    this.onViewportChangeCallbacks.add(callback);
    return () => {
      this.onViewportChangeCallbacks.delete(callback);
    };
  }

  private triggerViewportChange() {
    if (
      this.panX !== this.lastTriggeredPanX ||
      this.panY !== this.lastTriggeredPanY ||
      this.zoom !== this.lastTriggeredZoom
    ) {
      this.lastTriggeredPanX = this.panX;
      this.lastTriggeredPanY = this.panY;
      this.lastTriggeredZoom = this.zoom;
      this.onViewportChangeCallbacks.forEach((cb) => cb());
    }
  }

  private getEffectiveColor = (color: string | undefined): string => {
    if (!color || color === "#000000") return "#ffffff";
    return color;
  };

  // Helper methods returning if history is available
  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getZoom = () => {
    return this.zoom;
  };

  getSelectedColor = () => {
    return this.selectedColor;
  };

  /**
   * Sets the temporary preview shapes generated by AI.
   * @param tempShapes Array of temporary Shape objects.
   */
  setTempShapes = (tempShapes: Shape[]) => {
    this.tempShapes = tempShapes;
    this.clearCanvas();
  };

  /**
   * Sets the active drawing or fill color.
   * @param color Hex color code.
   */
  setColor = (color: string) => {
    this.selectedColor = color;
  };

  public undo() {
    if (this.myRole === "Viewer") return;
    if (this.undoStack.length === 0) return;

    const action = this.undoStack.pop();

    if (!action) return;

    this.redoStack.push(action);

    if (action.type === "create") {
      this.ws.send(
        JSON.stringify({
          type: "delete_shape",
          roomId: this.roomId,
          shapeId: action.shapeId,
        }),
      );

      if (this.selectedShape?.id === action.shapeId) {
        this.selectedShape = null;
        this.rotateIconLocation = null;
        this.shapeSelectors = [];
        this.triggerSelectionChange();
      }
    } else if (action.type === "update") {
      this.ws.send(
        JSON.stringify({
          type: "update_shape",
          roomId: this.roomId,
          shapeId: action.shapeId,
          shape: JSON.stringify(action.before),
          updatedBy: this.myUserId,
        }),
      );

      const undoShapeId = this.existingShapes.findIndex(
        (shape) => shape.id === action.shapeId,
      );
      if (undoShapeId !== -1) {
        this.existingShapes[undoShapeId] = action.before;
        if (this.selectedShape?.id === action.shapeId) {
          this.selectedShape = action.before;
          this.updateSelectors(action.before);
          this.triggerSelectionChange();
        }
        this.clearCanvas();
      }
    } else if (action.type === "delete") {
      const tempHistoryId = Math.random().toString(36).substring(2, 9);
      this.pendingHistoryMap.set(tempHistoryId, action);
      const taggedShape = { ...action.shape, tempHistoryId };

      this.ws.send(
        JSON.stringify({
          type: "chat",
          roomId: this.roomId,
          shape: JSON.stringify(taggedShape),
          userId: this.myUserId,
        }),
      );
    }
    this.triggerHistoryChange();
  }

  public redo() {
    if (this.myRole === "Viewer") return;
    if (this.redoStack.length === 0) return;

    const action = this.redoStack.pop();

    if (!action) return;

    this.undoStack.push(action);

    if (action.type === "create") {
      const tempHistoryId = Math.random().toString(36).substring(2, 9);
      this.pendingHistoryMap.set(tempHistoryId, action);
      const taggedShape = { ...action.shape, tempHistoryId };

      this.ws.send(
        JSON.stringify({
          type: "chat",
          roomId: this.roomId,
          shape: JSON.stringify(taggedShape),
          userId: this.myUserId,
        }),
      );
    } else if (action.type === "update") {
      this.ws.send(
        JSON.stringify({
          type: "update_shape",
          roomId: this.roomId,
          shapeId: action.shapeId,
          shape: JSON.stringify(action.after),
          updatedBy: this.myUserId,
        }),
      );

      const redoShapeId = this.existingShapes.findIndex(
        (shape) => shape.id === action.shapeId,
      );

      if (redoShapeId !== -1) {
        this.existingShapes[redoShapeId] = action.after;
        if (this.selectedShape?.id === action.shapeId) {
          this.selectedShape = action.after;
          this.updateSelectors(action.after);
          this.triggerSelectionChange();
        }
        this.clearCanvas();
      }
    } else if (action.type === "delete") {
      this.ws.send(
        JSON.stringify({
          type: "delete_shape",
          roomId: this.roomId,
          shapeId: action.shapeId,
        }),
      );

      if (this.selectedShape?.id === action.shapeId) {
        this.selectedShape = null;
        this.shapeSelectors = [];
        this.triggerSelectionChange();
      }
    }
    this.triggerHistoryChange();
  }
  /**
   * Helper to get the bounding box of a shape.
   */
  private getShapeBoundingBox = (shape: Shape) => {
    if (shape.type === "rectangle" || shape.type === "image") {
      const x1 = Math.min(shape.startX, shape.startX + shape.width);
      const x2 = Math.max(shape.startX, shape.startX + shape.width);
      const y1 = Math.min(shape.startY, shape.startY + shape.height);
      const y2 = Math.max(shape.startY, shape.startY + shape.height);
      return { x1, x2, y1, y2 };
    } else if (shape.type === "circle") {
      const x1 = shape.centerX - shape.radius;
      const x2 = shape.centerX + shape.radius;
      const y1 = shape.centerY - shape.radius;
      const y2 = shape.centerY + shape.radius;
      return { x1, x2, y1, y2 };
    } else if (shape.type === "line") {
      const x1 = Math.min(shape.startX, shape.endX);
      const x2 = Math.max(shape.startX, shape.endX);
      const y1 = Math.min(shape.startY, shape.endY);
      const y2 = Math.max(shape.startY, shape.endY);
      return { x1, x2, y1, y2 };
    } else if (shape.type === "text") {
      this.ctx.save();
      this.ctx.font = `${shape.fontSize || 20}px sans-serif`;
      const metrics = this.ctx.measureText(shape.text);
      const width = metrics.width;
      const height = shape.fontSize || 20;
      this.ctx.restore();
      const x1 = shape.startX;
      const x2 = shape.startX + width;
      const y1 = shape.startY;
      const y2 = shape.startY + height;
      return { x1, x2, y1, y2 };
    }
    return { x1: 0, x2: 0, y1: 0, y2: 0 };
  };

  /**
   * Checks if two shapes overlap based on their bounding boxes.
   */
  private checkOverlap = (shapeA: Shape, shapeB: Shape) => {
    const boxA = this.getShapeBoundingBox(shapeA);
    const boxB = this.getShapeBoundingBox(shapeB);
    return (
      boxA.x1 < boxB.x2 &&
      boxA.x2 > boxB.x1 &&
      boxA.y1 < boxB.y2 &&
      boxA.y2 > boxB.y1
    );
  };

  /**
   * Helper to update two shapes locally, send updates to backend/websocket, and re-render.
   */
  private updateTwoShapes = (
    shape1: Shape,
    shape2: Shape,
    eventType?: EventType,
    shape1FromZ?: number,
    shape2FromZ?: number,
  ) => {
    let changed = false;
    let beforeShape1: Shape | null = null;
    let beforeShape2: Shape | null = null;

    if (shape1.id) {
      const idx = this.existingShapes.findIndex((s) => s.id === shape1.id);
      if (idx !== -1) {
        beforeShape1 = { ...this.existingShapes[idx] };
        this.existingShapes[idx] = shape1;
        this.ws.send(
          JSON.stringify({
            type: "update_shape",
            eventType,
            roomId: this.roomId,
            shapeId: shape1.id,
            shape: JSON.stringify(shape1),
            fromZ: shape1FromZ,
            toZ: shape1.zIndex,
          }),
        );
        changed = true;
      }
    }
    if (shape2.id) {
      const idx = this.existingShapes.findIndex((s) => s.id === shape2.id);
      if (idx !== -1) {
        beforeShape2 = { ...this.existingShapes[idx] };
        this.existingShapes[idx] = shape2;
        this.ws.send(
          JSON.stringify({
            type: "update_shape",
            eventType,
            roomId: this.roomId,
            shapeId: shape2.id,
            shape: JSON.stringify(shape2),
            fromZ: shape2FromZ,
            toZ: shape2.zIndex,
          }),
        );
        changed = true;
      }
    }
    if (changed) {
      if (!this.isUndoingRedoing) {
        if (beforeShape1 && shape1.id) {
          this.undoStack.push({
            type: "update",
            shapeId: shape1.id,
            before: beforeShape1,
            after: { ...shape1 },
          });
        }
        if (beforeShape2 && shape2.id) {
          this.undoStack.push({
            type: "update",
            shapeId: shape2.id,
            before: beforeShape2,
            after: { ...shape2 },
          });
        }
        this.redoStack = [];
        this.triggerHistoryChange();
      }

      this.existingShapes.sort((a, b) => {
        const zA = a.zIndex || 0;
        const zB = b.zIndex || 0;
        return zA - zB;
      });
      if (this.selectedShape) {
        const found = this.existingShapes.find(
          (s) => s.id === this.selectedShape?.id,
        );
        if (found) {
          this.selectedShape = found;
          this.updateSelectors(found);
        }
      }
      this.clearCanvas();
      this.triggerSelectionChange();
    }
  };

  /**
   * Brings the selected shape forward by one position among overlapping shapes.
   */
  bringForward = () => {
    if (this.myRole === "Viewer") return;
    if (!this.selectedShape) return;

    // Get all non-pointer shapes that overlap with the selected shape, including itself
    const overlapping = this.existingShapes.filter(
      (s) =>
        s.id === this.selectedShape?.id ||
        (this.selectedShape && this.checkOverlap(this.selectedShape, s)),
    );

    if (overlapping.length <= 1) {
      console.log("No other overlapping shapes to bring forward relative to.");
      return;
    }

    const selectedIdx = overlapping.findIndex(
      (s) => s.id === this.selectedShape?.id,
    );
    if (selectedIdx === -1 || selectedIdx === overlapping.length - 1) {
      console.log(
        "Selected shape is already at the front of overlapping shapes.",
      );
      return;
    }

    const nextShape = overlapping[selectedIdx + 1];
    const curZ = this.selectedShape.zIndex || 0;
    const nextZ = nextShape.zIndex || 0;

    let updatedSelected: Shape;
    let updatedNext: Shape;

    if (curZ === nextZ) {
      updatedSelected = { ...this.selectedShape, zIndex: nextZ + 1 } as Shape;
      updatedNext = { ...nextShape, zIndex: curZ } as Shape;
    } else {
      updatedSelected = { ...this.selectedShape, zIndex: nextZ } as Shape;
      updatedNext = { ...nextShape, zIndex: curZ } as Shape;
    }

    this.updateTwoShapes(
      updatedSelected,
      updatedNext,
      EventType.CHANGE_LAYER,
      curZ,
      nextZ,
    );
  };

  /**
   * Sends the selected shape backward by one position among overlapping shapes.
   */
  sendBackward = () => {
    if (this.myRole === "Viewer") return;
    if (!this.selectedShape) return;

    // Get all non-pointer shapes that overlap with the selected shape, including itself
    const overlapping = this.existingShapes.filter(
      (s) =>
        s.id === this.selectedShape?.id ||
        (this.selectedShape && this.checkOverlap(this.selectedShape, s)),
    );

    if (overlapping.length <= 1) {
      console.log("No other overlapping shapes to send backward relative to.");
      return;
    }

    const selectedIdx = overlapping.findIndex(
      (s) => s.id === this.selectedShape?.id,
    );
    if (selectedIdx === -1 || selectedIdx === 0) {
      console.log(
        "Selected shape is already at the back of overlapping shapes.",
      );
      return;
    }

    const prevShape = overlapping[selectedIdx - 1];
    const curZ = this.selectedShape.zIndex || 0;
    const prevZ = prevShape.zIndex || 0;

    let updatedSelected: Shape;
    let updatedPrev: Shape;

    if (curZ === prevZ) {
      updatedSelected = { ...this.selectedShape, zIndex: prevZ - 1 } as Shape;
      updatedPrev = { ...prevShape, zIndex: curZ } as Shape;
    } else {
      updatedSelected = { ...this.selectedShape, zIndex: prevZ } as Shape;
      updatedPrev = { ...prevShape, zIndex: curZ } as Shape;
    }

    this.updateTwoShapes(
      updatedSelected,
      updatedPrev,
      EventType.CHANGE_LAYER,
      curZ,
      prevZ,
    );
  };

  /**
   * Exposes helper to get user's display name from their ID.
   */
  getUserName = (userId?: string): string | null => {
    if (!userId) return null;
    if (userId === this.myUserId) return "You";
    const user = this.users[userId];
    return user ? `${user.firstName} ${user.lastName}`.trim() : null;
  };

  private triggerSelectionChange = () => {
    if (this.onSelectionChange) {
      if (this.selectedShape) {
        this.onSelectionChange({ ...this.selectedShape });
      } else {
        this.onSelectionChange(null);
      }
    }
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
    return this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
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
    if (this.myRole === "Viewer") return;
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

        const tempImg = new Image();
        tempImg.onload = () => {
          const beforeShape = { ...shape };

          shape.url = base64Url;
          if (tempImg.width && tempImg.height) {
            const aspect = tempImg.width / tempImg.height;
            shape.height = shape.width / aspect;
          }

          const afterShape = { ...shape };

          if (!this.isUndoingRedoing && shape.id) {
            this.undoStack.push({
              type: "update",
              shapeId: shape.id,
              before: beforeShape,
              after: { ...afterShape },
            });
            this.redoStack = [];
            this.triggerHistoryChange();
          }

          const delta = {
            url: shape.url,
            height: shape.height,
          };

          this.updateSelectors(shape);
          this.clearCanvas();
          this.triggerSelectionChange();
          this.ws.send(
            JSON.stringify({
              type: "update_shape",
              eventType: EventType.ADD_IMAGE,
              roomId: this.roomId,
              shapeId: shape.id || -1,
              shape: JSON.stringify(delta),
            }),
          );
        };
        tempImg.src = base64Url;
      };
      fileReader.readAsDataURL(file);
    };

    // 9. Programmatically click the hidden input to open the native system file selector
    input.click();
  };

  focusOnCoordinates = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) => {
    if (this.focusAnimationId !== null) {
      cancelAnimationFrame(this.focusAnimationId);
    }

    const targetWidth = endX - startX;
    const targetHeight = endY - startY;

    if (
      isNaN(targetWidth) ||
      targetWidth <= 0 ||
      isNaN(targetHeight) ||
      targetHeight <= 0
    ) {
      return;
    }

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Dynamically calculate target zoom level to fit the targeted viewport area, clamped within allowed bounds
    const zoomX = screenWidth / targetWidth;
    const zoomY = screenHeight / targetHeight;
    const calculatedZoom = Math.min(zoomX, zoomY);
    const targetZoom = Math.max(0.5, Math.min(5, calculatedZoom));

    const targetCenterX = startX + targetWidth / 2;
    const targetCenterY = startY + targetHeight / 2;

    const targetPanX = screenWidth / 2 - targetCenterX * targetZoom;
    const targetPanY = screenHeight / 2 - targetCenterY * targetZoom;

    const duration = 400; // milliseconds
    const startTime = performance.now();
    const startPanX = this.panX;
    const startPanY = this.panY;
    const startZoom = this.zoom;

    // Cubic easing out: smooth deceleration
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      this.zoom = startZoom + (targetZoom - startZoom) * easedProgress;
      this.panX = startPanX + (targetPanX - startPanX) * easedProgress;
      this.panY = startPanY + (targetPanY - startPanY) * easedProgress;

      this.clearCanvas();

      if (progress < 1) {
        this.focusAnimationId = requestAnimationFrame(animate);
      } else {
        this.focusAnimationId = null;
        this.updateScreenCoordinates();
      }
    };

    this.focusAnimationId = requestAnimationFrame(animate);
  };

  updateScreenCoordinates = () => {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const start = this.screenToWorld(0, 0);
    const end = this.screenToWorld(window.innerWidth, window.innerHeight);
    const canvasStartX = start.x;
    const canvasStartY = start.y;
    const canvasEndX = end.x;
    const canvasEndY = end.y;

    this.ws.send(
      JSON.stringify({
        type: "change_screen_coordinates",
        userId: this.myUserId,
        roomId: this.roomId,
        canvasStartX,
        canvasStartY,
        canvasEndX,
        canvasEndY,
      }),
    );
  };

  debouncedUpdateScreenCoordinates = () => {
    if (this.coordinateUpdateTimeout) {
      clearTimeout(this.coordinateUpdateTimeout);
    }
    this.coordinateUpdateTimeout = setTimeout(() => {
      this.updateScreenCoordinates();
      this.coordinateUpdateTimeout = null;
    }, 300);
  };

  private getShapeCenters = (shape: Shape) => {
    switch (shape.type) {
      case "rectangle": {
        return {
          centerX: shape.startX + shape.width / 2,
          centerY: shape.startY + shape.height / 2,
        };
      }
      case "circle": {
        return { centerX: shape.centerX, centerY: shape.centerY };
      }
      case "line": {
        return {
          centerX: shape.startX + (shape.endX - shape.startX) / 2,
          centerY: shape.startY + (shape.endY - shape.startY) / 2,
        };
      }
      case "image": {
        return {
          centerX: shape.startX + shape.width / 2,
          centerY: shape.startY + shape.height / 2,
        };
      }
      case "text": {
        return { centerX: shape.startX, centerY: shape.startY };
      }
      default: {
        return { centerX: 0, centerY: 0 };
      }
    }
  };
  /**
   * Handles the 'mousedown' event.
   * Responsible for initiating drawing, entering viewport pan mode, selecting shapes,
   * or picking resize selectors/handles for shape manipulation.
   */
  mouseDownHandler = (e: MouseEvent) => {
    if (this.replayShapes !== null) return;

    if (e.button === 1) {
      this.isPan = true;
      this.isClicked = true;
      this.updateScreenCoordinates();
      return;
    }

    this.isClicked = true;
    const { x, y } = this.getMousePos(e);
    this.startX = x;
    this.startY = y;

    if (this.myRole === "Viewer") {
      if (this.selectedTool !== "pointer") {
        alert("You are in view-only mode");
      }
      return;
    }

    if (this.rotateIconLocation && this.selectedShape) {
      if (
        x > this.rotateIconLocation.x - 10 &&
        x < this.rotateIconLocation.x + 20 &&
        y > this.rotateIconLocation.y - 10 &&
        y < this.rotateIconLocation.y + 20
      ) {
        this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));
        this.isRotating = true;
        return;
      }
    }

    // Pointer tool logic: Determine if the user is clicking a control handle or a shape
    if (this.selectedTool === "pointer") {
      const hit = this.hitTest(x, y);

      // Store a deep copy of the selected shape configuration to track offset modifications accurately
      this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));

      if (
        hit &&
        hit !== "rotate" &&
        hit.type === "selector" &&
        this.selectedShape
      ) {
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
    if (this.replayShapes !== null) return;
    const { x: currentX, y: currentY } = this.getMousePos(e);
    this.lastMouseWorldX = currentX;
    this.lastMouseWorldY = currentY;
    if (this.onMouseMove) {
      this.onMouseMove(Math.round(currentX), Math.round(currentY));
    }

    if (this.myRole === "Viewer" && !this.isPan) {
      this.isClicked = false;
      return;
    }

    // If the pan mode is active (activated via spacebar), adjust the pan offset relative to screen translation
    if (this.isPan && this.isClicked) {
      this.panX += e.movementX;
      this.panY += e.movementY;
      this.clearCanvas();
      return;
    }

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
      this.ctx.strokeStyle = this.getEffectiveColor(this.selectedColor);

      if (this.selectedTool === "rectangle") {
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
      } else if (this.selectedTool === "image") {
        this.ctx.save();
        this.ctx.setLineDash([10, 5]);
        const aspectRatio = this.getImageAspectRatio("/add-image.png");
        let drawWidth = width;
        let drawHeight = height;
        if (Math.abs(width) > Math.abs(height) * aspectRatio) {
          drawWidth = Math.sign(width) * Math.abs(height) * aspectRatio;
        } else {
          drawHeight = (Math.sign(height) * Math.abs(width)) / aspectRatio;
        }
        this.ctx.strokeRect(this.startX, this.startY, drawWidth, drawHeight);
        this.ctx.strokeRect(
          this.startX + drawWidth / 3,
          this.startY + drawHeight / 3,
          drawWidth / 3,
          drawHeight / 3,
        );
        const img = this.getImage("/add-image.png");
        if (img) {
          this.ctx.drawImage(
            img,
            this.startX + drawWidth / 3,
            this.startY + drawHeight / 3,
            drawWidth / 3,
            drawHeight / 3,
          );
        }
        this.ctx.restore();
      }
    }

    // Editing mode logic: Resizing or moving selected shapes
    if (
      this.isClicked &&
      this.selectedShape &&
      this.originalShape &&
      !this.isPan
    ) {
      const deltaX = currentX - this.startX;
      const deltaY = currentY - this.startY;
      if (this.isRotating && this.rotateIconLocation) {
        const { centerX, centerY } = this.getShapeCenters(this.selectedShape);

        // Calculate angle and offset by 90 degrees since the handle is at the top (-90 degrees)
        const angle =
          Math.atan2(currentY - centerY, currentX - centerX) * (180 / Math.PI) +
          90;

        if (this.selectedShape.type !== "text") {
          this.selectedShape.angle = angle;
        }

        this.updateSelectors(this.selectedShape);
        this.clearCanvas();
        return;
      }

      if (this.draggedSelector) {
        // CASE A: Dragging a specific resize handle
        if (
          (this.selectedShape.type === "rectangle" ||
            this.selectedShape.type === "image") &&
          (this.originalShape.type === "rectangle" ||
            this.originalShape.type === "image")
        ) {
          const originalRect = this.originalShape;
          const rect = this.selectedShape;
          const selectorId = this.draggedSelector.id;

          const { centerX, centerY } = this.getShapeCenters(originalRect);
          const rad = ((originalRect.angle || 0) * Math.PI) / 180;
          const w = originalRect.width;
          const h = originalRect.height;

          let dragged_corner_local = { x: 0, y: 0 };
          let fixed_corner_local = { x: 0, y: 0 };

          switch (selectorId) {
            case 1: // Top-left
              dragged_corner_local = { x: -w / 2, y: -h / 2 };
              fixed_corner_local = { x: w / 2, y: h / 2 };
              break;
            case 2: // Top-right
              dragged_corner_local = { x: w / 2, y: -h / 2 };
              fixed_corner_local = { x: -w / 2, y: h / 2 };
              break;
            case 3: // Bottom-right
              dragged_corner_local = { x: w / 2, y: h / 2 };
              fixed_corner_local = { x: -w / 2, y: -h / 2 };
              break;
            case 4: // Bottom-left
              dragged_corner_local = { x: -w / 2, y: h / 2 };
              fixed_corner_local = { x: w / 2, y: -h / 2 };
              break;
          }

          // Transform current mouse coordinates to original shape's local system
          const dx = currentX - centerX;
          const dy = currentY - centerY;
          const cosNeg = Math.cos(-rad);
          const sinNeg = Math.sin(-rad);
          const localM = {
            x: dx * cosNeg - dy * sinNeg,
            y: dx * sinNeg + dy * cosNeg,
          };

          let dragged_local = { x: 0, y: 0 };

          if (rect.type === "image" && originalRect.type === "image") {
            // Keep aspect ratio for images
            const original_diagonal = {
              x: dragged_corner_local.x - fixed_corner_local.x,
              y: dragged_corner_local.y - fixed_corner_local.y,
            };
            const new_diagonal_local = {
              x: localM.x - fixed_corner_local.x,
              y: localM.y - fixed_corner_local.y,
            };
            const denom = original_diagonal.x ** 2 + original_diagonal.y ** 2;
            const k =
              denom !== 0
                ? (new_diagonal_local.x * original_diagonal.x +
                    new_diagonal_local.y * original_diagonal.y) /
                  denom
                : 0;

            const constrained_diagonal = {
              x: k * original_diagonal.x,
              y: k * original_diagonal.y,
            };
            dragged_local = {
              x: fixed_corner_local.x + constrained_diagonal.x,
              y: fixed_corner_local.y + constrained_diagonal.y,
            };
          } else {
            // Allow non-uniform scaling for normal rectangles
            dragged_local = localM;
          }

          const newWidth = Math.abs(dragged_local.x - fixed_corner_local.x);
          const newHeight = Math.abs(dragged_local.y - fixed_corner_local.y);

          const newLocalCenter = {
            x: (dragged_local.x + fixed_corner_local.x) / 2,
            y: (dragged_local.y + fixed_corner_local.y) / 2,
          };

          const cosPos = Math.cos(rad);
          const sinPos = Math.sin(rad);
          const newCx =
            centerX + newLocalCenter.x * cosPos - newLocalCenter.y * sinPos;
          const newCy =
            centerY + newLocalCenter.x * sinPos + newLocalCenter.y * cosPos;

          rect.width = newWidth;
          rect.height = newHeight;
          rect.startX = newCx - newWidth / 2;
          rect.startY = newCy - newHeight / 2;

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
              (originalCircle.radius + deltaY) ** 2,
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

          const { centerX: origCenterX, centerY: origCenterY } =
            this.getShapeCenters(originalLine);
          const rad = ((originalLine.angle || 0) * Math.PI) / 180;

          // Calculate current rotated world endpoints of the original line
          const getRotatedPoint = (x: number, y: number) => {
            const dx = x - origCenterX;
            const dy = y - origCenterY;
            return {
              x: origCenterX + dx * Math.cos(rad) - dy * Math.sin(rad),
              y: origCenterY + dx * Math.sin(rad) + dy * Math.cos(rad),
            };
          };

          const origWStart = getRotatedPoint(
            originalLine.startX,
            originalLine.startY,
          );
          const origWEnd = getRotatedPoint(
            originalLine.endX,
            originalLine.endY,
          );

          let W_start = { x: 0, y: 0 };
          let W_end = { x: 0, y: 0 };

          if (selectorId === 1) {
            // Dragging start point: start point moves to current mouse, end point is fixed
            W_start = { x: currentX, y: currentY };
            W_end = origWEnd;
          } else if (selectorId === 2) {
            // Dragging end point: end point moves to current mouse, start point is fixed
            W_start = origWStart;
            W_end = { x: currentX, y: currentY };
          }

          // New center of the line segment in world space
          const newCx = (W_start.x + W_end.x) / 2;
          const newCy = (W_start.y + W_end.y) / 2;

          // Project world coordinates back to local coordinates by rotating by -rad around the new center
          const cosNeg = Math.cos(-rad);
          const sinNeg = Math.sin(-rad);

          const dxStart = W_start.x - newCx;
          const dyStart = W_start.y - newCy;
          line.startX = newCx + dxStart * cosNeg - dyStart * sinNeg;
          line.startY = newCy + dxStart * sinNeg + dyStart * cosNeg;

          const dxEnd = W_end.x - newCx;
          const dyEnd = W_end.y - newCy;
          line.endX = newCx + dxEnd * cosNeg - dyEnd * sinNeg;
          line.endY = newCy + dxEnd * sinNeg + dyEnd * cosNeg;

          this.updateSelectors(line);
        }
      } else {
        // CASE B: Moving the entire shape (dragging by body rather than selectors)
        if (
          (this.selectedShape.type === "rectangle" ||
            this.selectedShape.type === "image") &&
          (this.originalShape.type === "rectangle" ||
            this.originalShape.type === "image")
        ) {
          const rect = this.selectedShape;
          rect.startX = this.originalShape.startX + deltaX;
          rect.startY = this.originalShape.startY + deltaY;

          this.updateSelectors(rect);
        } else if (
          this.selectedShape.type === "circle" &&
          this.originalShape.type === "circle"
        ) {
          const circle = this.selectedShape;
          circle.centerX = this.originalShape.centerX + deltaX;
          circle.centerY = this.originalShape.centerY + deltaY;

          this.updateSelectors(circle);
        } else if (
          this.selectedShape.type === "line" &&
          this.originalShape.type === "line"
        ) {
          const line = this.selectedShape;
          line.startX = this.originalShape.startX + deltaX;
          line.startY = this.originalShape.startY + deltaY;
          line.endX = this.originalShape.endX + deltaX;
          line.endY = this.originalShape.endY + deltaY;

          this.updateSelectors(line);
        } else if (
          this.selectedShape.type === "text" &&
          this.originalShape.type === "text"
        ) {
          const textShape = this.selectedShape;
          textShape.startX = this.originalShape.startX + deltaX;
          textShape.startY = this.originalShape.startY + deltaY;
        }
      }
      this.clearCanvas();
      this.triggerSelectionChange();
    }
  };

  /**
   * Handles the 'mouseup' event.
   * Commits the finalized drawing geometry or finalized shape adjustments and pushes the changes
   * to the backend WebSocket channel so other users see updates in real time.
   */
  mouseUpHandler = (e: MouseEvent) => {
    if (this.replayShapes !== null) return;

    if (e.button === 1) {
      this.isPan = false;
      this.isClicked = false;
      this.updateScreenCoordinates();
      return;
    }
    if (this.myRole === "Viewer") {
      this.isClicked = false;
      return;
    }

    if (this.isPan) {
      this.isClicked = false;
      return;
    }

    // If we were resizing or moving an existing shape, push the update to the server
    if (
      this.draggedSelector ||
      (this.selectedTool === "pointer" && this.originalShape)
    ) {
      this.isClicked = false;

      const selectedShape = this.selectedShape;
      const originalShape = this.originalShape;

      if (!selectedShape || !originalShape) {
        this.draggedSelector = null;
        this.originalShape = null;
        this.isRotating = false;
        return;
      }

      let shapeId: number = -1;
      if (selectedShape.id) {
        shapeId = selectedShape.id;
      }

      let eventType = this.isRotating
        ? "ROTATE_SHAPE"
        : this.draggedSelector
          ? "SCALE_SHAPE"
          : "MOVE_SHAPE";

      // 1. Normalize shapes and update selectors
      if (
        (selectedShape.type === "rectangle" ||
          selectedShape.type === "image") &&
        (originalShape.type === "rectangle" || originalShape.type === "image")
      ) {
        const rect = selectedShape;
        if (rect.width < 0) {
          rect.startX = rect.startX + rect.width;
          rect.width = Math.abs(rect.width);
        }
        if (rect.height < 0) {
          rect.startY = rect.startY + rect.height;
          rect.height = Math.abs(rect.height);
        }
        this.updateSelectors(rect);
      } else if (
        selectedShape.type === "circle" &&
        originalShape.type === "circle"
      ) {
        const circle = selectedShape;
        if (circle.radius < 0) {
          circle.centerX = circle.centerX + circle.radius;
          circle.centerY = circle.centerY + circle.radius;
          circle.radius = Math.abs(circle.radius);
        }
        this.updateSelectors(circle);
      }

      // 2. Determine if shape state did change
      let didChange = false;
      if (eventType === "MOVE_SHAPE") {
        if (
          (selectedShape.type === "rectangle" ||
            selectedShape.type === "image" ||
            selectedShape.type === "text") &&
          (originalShape.type === "rectangle" ||
            originalShape.type === "image" ||
            originalShape.type === "text")
        ) {
          didChange =
            selectedShape.startX !== originalShape.startX ||
            selectedShape.startY !== originalShape.startY;
        } else if (
          selectedShape.type === "circle" &&
          originalShape.type === "circle"
        ) {
          didChange =
            selectedShape.centerX !== originalShape.centerX ||
            selectedShape.centerY !== originalShape.centerY;
        } else if (
          selectedShape.type === "line" &&
          originalShape.type === "line"
        ) {
          didChange =
            selectedShape.startX !== originalShape.startX ||
            selectedShape.startY !== originalShape.startY ||
            selectedShape.endX !== originalShape.endX ||
            selectedShape.endY !== originalShape.endY;
        } else if (
          selectedShape.type === "text" &&
          originalShape.type === "text"
        ) {
          didChange =
            selectedShape.startX !== originalShape.startX ||
            selectedShape.startY !== originalShape.startY;
        }
      } else if (eventType === "SCALE_SHAPE") {
        if (
          (selectedShape.type === "rectangle" ||
            selectedShape.type === "image") &&
          (originalShape.type === "rectangle" || originalShape.type === "image")
        ) {
          didChange =
            selectedShape.width !== originalShape.width ||
            selectedShape.height !== originalShape.height;
        } else if (
          selectedShape.type === "circle" &&
          originalShape.type === "circle"
        ) {
          didChange = selectedShape.radius !== originalShape.radius;
        } else if (
          selectedShape.type === "line" &&
          originalShape.type === "line"
        ) {
          didChange =
            selectedShape.startX !== originalShape.startX ||
            selectedShape.startY !== originalShape.startY ||
            selectedShape.endX !== originalShape.endX ||
            selectedShape.endY !== originalShape.endY;
        }
      } else if (eventType === "ROTATE_SHAPE") {
        if (
          (selectedShape.type === "rectangle" ||
            selectedShape.type === "image" ||
            selectedShape.type === "line") &&
          (originalShape.type === "rectangle" ||
            originalShape.type === "image" ||
            originalShape.type === "line")
        ) {
          didChange = (selectedShape.angle || 0) !== (originalShape.angle || 0);
        }
      }

      // 3. Broadcast the updates with detailed extra fields for logging
      if (didChange) {
        selectedShape.updatedByUserId = this.myUserId || undefined;

        if (!this.isUndoingRedoing && selectedShape.id) {
          this.undoStack.push({
            type: "update",
            shapeId: selectedShape.id,
            before: originalShape,
            after: { ...selectedShape },
          });
          this.redoStack = [];
          this.triggerHistoryChange();
        }

        let extraFields: Record<string, any> = {};
        if (eventType === "MOVE_SHAPE") {
          if (
            selectedShape.type === "circle" &&
            originalShape.type === "circle"
          ) {
            extraFields = {
              fromX: originalShape.centerX,
              fromY: originalShape.centerY,
              toX: selectedShape.centerX,
              toY: selectedShape.centerY,
            };
          } else if (
            selectedShape.type === "line" &&
            originalShape.type === "line"
          ) {
            extraFields = {
              fromStartX: originalShape.startX,
              fromStartY: originalShape.startY,
              fromEndX: originalShape.endX,
              fromEndY: originalShape.endY,
              toStartX: selectedShape.startX,
              toStartY: selectedShape.startY,
              toEndX: selectedShape.endX,
              toEndY: selectedShape.endY,
            };
          } else if (
            selectedShape.type !== "circle" &&
            originalShape.type !== "circle"
          ) {
            extraFields = {
              fromX: (originalShape as any).startX || 0,
              fromY: (originalShape as any).startY || 0,
              toX: (selectedShape as any).startX || 0,
              toY: (selectedShape as any).startY || 0,
            };
          }
        } else if (eventType === "SCALE_SHAPE") {
          if (
            (selectedShape.type === "rectangle" ||
              selectedShape.type === "image") &&
            (originalShape.type === "rectangle" ||
              originalShape.type === "image")
          ) {
            extraFields = {
              fromWidth: originalShape.width,
              fromHeight: originalShape.height,
              toWidth: selectedShape.width,
              toHeight: selectedShape.height,
            };
          } else if (
            selectedShape.type === "circle" &&
            originalShape.type === "circle"
          ) {
            extraFields = {
              fromRadius: originalShape.radius,
              toRadius: selectedShape.radius,
            };
          } else if (
            selectedShape.type === "line" &&
            originalShape.type === "line"
          ) {
            extraFields = {
              fromStartX: originalShape.startX,
              fromStartY: originalShape.startY,
              toEndX: selectedShape.endX,
              toEndY: selectedShape.endY,
            };
          }
        } else if (eventType === "ROTATE_SHAPE") {
          if (
            (selectedShape.type === "rectangle" ||
              selectedShape.type === "image" ||
              selectedShape.type === "line") &&
            (originalShape.type === "rectangle" ||
              originalShape.type === "image" ||
              originalShape.type === "line")
          ) {
            extraFields = {
              fromAngle: originalShape.angle || 0,
              toAngle: selectedShape.angle || 0,
            };
          }
        }
        this.ws.send(
          JSON.stringify({
            type: "update_shape",
            eventType,
            roomId: this.roomId,
            shapeId: shapeId,
            shape: JSON.stringify(selectedShape),
            updatedBy: this.myUserId,
            ...extraFields,
          }),
        );
      }

      this.draggedSelector = null;
      this.originalShape = null;
      this.isRotating = false;
      this.triggerSelectionChange();

      return;
    }

    this.isClicked = false;
    const { x: currentX, y: currentY } = this.getMousePos(e);

    const width = currentX - this.startX;
    const height = currentY - this.startY;

    if (!this.myUserId) {
      console.error("No user ID found");
      return;
    }
    // Map the local mouse release geometry into a new Shape payload
    let shape: Shape;
    const zIndex = this.existingShapes.length;
    if (this.selectedTool === "line") {
      shape = {
        startX: this.startX,
        startY: this.startY,
        endX: currentX,
        endY: currentY,
        type: this.selectedTool,
        zIndex,
        color: this.selectedColor,
      };
    } else if (this.selectedTool === "rectangle") {
      shape = {
        type: this.selectedTool,
        startX: width >= 0 ? this.startX : this.startX + width,
        startY: height >= 0 ? this.startY : this.startY + height,
        width: Math.abs(width),
        height: Math.abs(height),
        bg_color: "",
        zIndex,
        color: this.selectedColor,
      };
    } else if (this.selectedTool === "circle") {
      shape = {
        type: this.selectedTool,
        centerX: this.startX,
        centerY: this.startY,
        radius: Math.sqrt(width * width + height * height),
        zIndex,
        color: this.selectedColor,
      };
    } else if (this.selectedTool === "image") {
      const aspectRatio = this.getImageAspectRatio("/add-image.png");
      let drawWidth = width;
      let drawHeight = height;
      if (Math.abs(width) > Math.abs(height) * aspectRatio) {
        drawWidth = Math.sign(width) * Math.abs(height) * aspectRatio;
      } else {
        drawHeight = (Math.sign(height) * Math.abs(width)) / aspectRatio;
      }
      shape = {
        type: this.selectedTool,
        url: "",
        startX: drawWidth >= 0 ? this.startX : this.startX + drawWidth,
        startY: drawHeight >= 0 ? this.startY : this.startY + drawHeight,
        width: Math.abs(drawWidth),
        height: Math.abs(drawHeight),
        zIndex,
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
        userId: this.myUserId,
      }),
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
        this.rotateIconLocation = null;
        this.triggerSelectionChange();
      } else if (hitResult !== "rotate" && hitResult.type === "selector") {
        // Clicked on a resize handle selector -> Selection state remains unchanged
      } else if (hitResult === "rotate") {
        // Clicked on the rotate icon
      } else {
        // Clicked on a shape body -> Set selection and build corresponding resize handle coordinates
        this.selectedShape = hitResult;
        this.triggerSelectionChange();

        // Check if clicked inside the middle 1/3 of an image placeholder shape to trigger upload
        if (hitResult.type === "image" && !hitResult.url) {
          const { centerX, centerY } = this.getShapeCenters(hitResult);
          const rad = ((hitResult.angle || 0) * Math.PI) / 180;
          const dx_click = x - centerX;
          const dy_click = y - centerY;
          const unrotatedX =
            centerX + dx_click * Math.cos(-rad) - dy_click * Math.sin(-rad);
          const unrotatedY =
            centerY + dx_click * Math.sin(-rad) + dy_click * Math.cos(-rad);

          const midXMin = hitResult.startX + hitResult.width / 3;
          const midXMax = hitResult.startX + (2 * hitResult.width) / 3;
          const midYMin = hitResult.startY + hitResult.height / 3;
          const midYMax = hitResult.startY + (2 * hitResult.height) / 3;

          if (
            unrotatedX >= midXMin &&
            unrotatedX <= midXMax &&
            unrotatedY >= midYMin &&
            unrotatedY <= midYMax
          ) {
            this.triggerImageUpload(hitResult);
            this.clearCanvas();
            return;
          }
        }

        this.updateSelectors(hitResult);
      }
      this.clearCanvas();
    }

    if (this.selectedTool === "bucket") {
      if (this.myRole === "Viewer") return;
      const { x, y } = this.getMousePos(e);
      const shape = this.hitTest(x, y);

      if (!shape || shape === "rotate") return;
      if (shape.type === "selector") return;
      if (shape.type !== "rectangle" && shape.type !== "circle") return;

      const fromColor = shape.bg_color || "";
      const beforeShape = { ...shape };

      shape.bg_color = this.selectedColor;
      shape.updatedByUserId = this.myUserId || undefined;
      const afterShape = { ...shape };

      if (!this.isUndoingRedoing && shape.id) {
        this.undoStack.push({
          type: "update",
          shapeId: shape.id,
          before: beforeShape,
          after: { ...afterShape },
        });
        this.redoStack = [];
        this.triggerHistoryChange();
      }

      this.ws.send(
        JSON.stringify({
          type: "update_shape",
          eventType: EventType.CHANGE_FILL,
          fromColor: fromColor,
          toColor: this.selectedColor,
          roomId: this.roomId,
          shapeId: shape.id,
          shape: JSON.stringify(shape),
        }),
      );
      this.clearCanvas();
    }

    if (this.selectedTool === "text") {
      if (this.myRole === "Viewer") return;
      const { x, y } = this.getMousePos(e);
      const screenX = e.clientX;
      const screenY = e.clientY;

      this.onStartTextEdit?.(
        screenX,
        screenY,
        "",
        20,
        (text) => {
          if (!text.trim()) return;
          const shape: Shape = {
            type: "text",
            startX: x,
            startY: y,
            text,
            fontSize: 20,
            color: this.selectedColor,
            zIndex: this.existingShapes.length,
          };

          this.ws.send(
            JSON.stringify({
              type: "chat",
              roomId: this.roomId,
              eventType: EventType.CREATE_SHAPE,
              shape: JSON.stringify(shape),
              userId: this.myUserId,
            }),
          );
        },
        () => {},
      );
    }
  };

  mouseDoubleClickHandler = (e: MouseEvent) => {
    if (this.myRole === "Viewer") return;
    if (this.selectedTool === "pointer") {
      const { x, y } = this.getMousePos(e);
      const hitResult = this.hitTest(x, y);

      if (hitResult && hitResult !== "rotate" && hitResult.type === "image") {
        this.triggerImageUpload(hitResult);
      } else if (
        hitResult &&
        hitResult !== "rotate" &&
        hitResult.type === "text"
      ) {
        const canvasRect = this.canvas.getBoundingClientRect();
        const screenPos = this.worldToScreen(
          hitResult.startX,
          hitResult.startY,
        );
        const screenX = canvasRect.left + screenPos.x;
        const screenY = canvasRect.top + screenPos.y;

        this.editingTextShapeId = hitResult.id;
        this.clearCanvas();

        this.onStartTextEdit?.(
          screenX,
          screenY,
          hitResult.text,
          hitResult.fontSize || 20,
          (newText) => {
            this.editingTextShapeId = undefined;
            if (!newText.trim()) {
              this.deleteShapeById(hitResult.id);
            } else {
              const updated = { ...hitResult, text: newText } as Shape;
              this.updateShape(updated, EventType.CHANGE_TEXT, {
                fromText: hitResult.text,
                toText: newText,
              });
            }
          },
          () => {
            this.editingTextShapeId = undefined;
            this.clearCanvas();
          },
        );
      }
    }
  };

  /**
   * Handles the mouse 'wheel' event.
   * Performs responsive zooming when pinch-zooming (ctrlKey) and pans the canvas when scrolling.
   */
  mouseWheelHandler = (e: WheelEvent) => {
    e.preventDefault(); // Stop native page scroll action

    if (e.ctrlKey) {
      // 1. Pinch-to-zoom (Zoom-to-Cursor Algorithm)
      const scaleFactor = 1 - e.deltaY * 0.001;
      const newZoom = this.zoom * scaleFactor;

      // Enforce zoom constraints
      if (newZoom < 0.5 || newZoom > 5) return;

      const { x: mouseWorldX, y: mouseWorldY } = this.getMousePos(e);
      this.zoom = newZoom;

      const rect = this.canvas.getBoundingClientRect();
      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;

      this.panX = mouseScreenX - mouseWorldX * this.zoom;
      this.panY = mouseScreenY - mouseWorldY * this.zoom;

      this.clearCanvas();
      this.debouncedUpdateScreenCoordinates();
    } else {
      // 2. Trackpad / Scrollwheel Panning
      this.panX -= e.deltaX;
      this.panY -= e.deltaY;
      this.clearCanvas();
    }
  };

  /**
   * Handles the keyboard 'keydown' event.
   * Activates pan mode when the Spacebar key is depressed.
   */
  keyboardDownHandler = (e: KeyboardEvent) => {
    if (e.key === " ") {
      this.isPan = true;
    }
  };

  /**
   * Handles the keyboard 'keyup' event.
   * Deactivates pan mode when the Spacebar key is released.
   */
  keyboardUpHandler = (e: KeyboardEvent) => {
    if (e.key === " ") {
      this.isPan = false;
      this.updateScreenCoordinates();
    }
  };

  oneTimeKeyboardPressHandler = (e: KeyboardEvent) => {
    if (e.repeat) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
      return;
    }

    if (e.key === "Delete") {
      if (this.selectedShape) {
        this.deleteSelectedShape();
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      if (this.selectedShape) {
        const shape = JSON.parse(JSON.stringify(this.selectedShape));
        shape.id = undefined;
        shape.zIndex = this.existingShapes.length;
        this.ws.send(
          JSON.stringify({
            type: "chat",
            roomId: this.roomId,
            eventType: EventType.CREATE_SHAPE,
            shape: JSON.stringify(shape),
            userId: this.myUserId,
          }),
        );
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      if (this.selectedShape) {
        this.clipboardShape = JSON.parse(JSON.stringify(this.selectedShape));
        if (this.clipboardShape) {
          this.clipboardShape.id = undefined; // Clear ID so it recreates on paste
        }
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      if (this.clipboardShape) {
        let shape = JSON.parse(JSON.stringify(this.clipboardShape));
        const x = this.lastMouseWorldX;
        const y = this.lastMouseWorldY;

        if (shape.type === "rectangle" || shape.type === "image") {
          shape.startX = x - (shape.width || 100) / 2;
          shape.startY = y - (shape.height || 100) / 2;
        } else if (shape.type === "circle") {
          shape.centerX = x;
          shape.centerY = y;
        } else if (shape.type === "line") {
          const originalCenterX = ((shape.startX || 0) + (shape.endX || 0)) / 2;
          const originalCenterY = ((shape.startY || 0) + (shape.endY || 0)) / 2;

          const dxStart = (shape.startX || 0) - originalCenterX;
          const dyStart = (shape.startY || 0) - originalCenterY;
          const dxEnd = (shape.endX || 0) - originalCenterX;
          const dyEnd = (shape.endY || 0) - originalCenterY;

          shape.startX = x + dxStart;
          shape.startY = y + dyStart;
          shape.endX = x + dxEnd;
          shape.endY = y + dyEnd;
        } else if (shape.type === "text") {
          shape.startX = x;
          shape.startY = y;
        }

        shape.zIndex = this.existingShapes.length;

        this.ws.send(
          JSON.stringify({
            type: "chat",
            roomId: this.roomId,
            shape: JSON.stringify(shape),
            userId: this.myUserId,
          }),
        );
      }
    }

    if (this.selectedShape && this.selectedTool === "pointer") {
      if (e.key === "-") {
        this.sendBackward();
      }

      if (e.key === "+" || e.key === "=") {
        this.bringForward();
      }
    }
  };

  updateShape = (
    updatedShape: Shape,
    eventType?: EventType,
    extraFields?: Record<string, any>,
  ) => {
    if (this.myRole === "Viewer") return;
    if (updatedShape.id) {
      updatedShape.updatedByUserId = this.myUserId || undefined;
      const shapeIndex = this.existingShapes.findIndex(
        (s) => s.id === updatedShape.id,
      );
      if (shapeIndex !== -1) {
        if (!this.isUndoingRedoing) {
          this.undoStack.push({
            type: "update",
            shapeId: updatedShape.id,
            before: { ...this.existingShapes[shapeIndex] },
            after: { ...updatedShape },
          });
          this.redoStack = [];
          this.triggerHistoryChange();
        }

        this.existingShapes[shapeIndex] = updatedShape;
        this.selectedShape = updatedShape;
        this.updateSelectors(updatedShape);
        this.clearCanvas();
        this.triggerSelectionChange();

        this.ws.send(
          JSON.stringify({
            type: "update_shape",
            eventType,
            roomId: this.roomId,
            shapeId: updatedShape.id,
            shape: JSON.stringify(updatedShape),
            ...extraFields,
          }),
        );
      }
    }
  };

  deleteSelectedShape = () => {
    if (this.myRole === "Viewer") return;
    if (!this.selectedShape) return;

    if (!this.isUndoingRedoing && this.selectedShape) {
      this.undoStack.push({
        type: "delete",
        shapeId: this.selectedShape.id as number,
        shape: { ...this.selectedShape },
      });
      this.redoStack = [];
      this.triggerHistoryChange();
    }

    this.ws.send(
      JSON.stringify({
        type: "delete_shape",
        roomId: this.roomId,
        shapeId: this.selectedShape.id || -1,
      }),
    );
    // this.existingShapes = this.existingShapes.filter((shape) => (shape.type !== "pointer" && shape.id) !== (this.selectedShape!.type !== "pointer" && this.selectedShape!.id));
    // this.selectedShape = null;
    // this.clearCanvas();
  };

  deleteShapeById = (id?: number) => {
    if (this.myRole === "Viewer") return;
    if (id === undefined) return;

    const shape = this.existingShapes.find((s) => s.id === id);
    if (!this.isUndoingRedoing && shape && shape.id) {
      this.undoStack.push({
        type: "delete",
        shapeId: shape.id,
        shape: { ...shape },
      });
      this.redoStack = [];
      this.triggerHistoryChange();
    }
    this.ws.send(
      JSON.stringify({
        type: "delete_shape",
        roomId: this.roomId,
        shapeId: id,
      }),
    );
  };
  /**
   * Dynamically constructs the interactive resize handles (selectors) for the selected shape.
   * Handlers scale inverse to the zoom level so they remain visually legible at different zoom levels.
   *
   * @param shape The shape currently selected.
   */
  updateSelectors = (shape: Shape) => {
    if (shape.type === "rectangle" || shape.type === "image") {
      const radius = 6;
      const { centerX, centerY } = this.getShapeCenters(shape);
      const rad = ((shape.angle || 0) * Math.PI) / 180;

      // Function to rotate a relative point around the shape center
      const getRotatedCorner = (dx: number, dy: number) => {
        const x = centerX + dx * Math.cos(rad) - dy * Math.sin(rad);
        const y = centerY + dx * Math.sin(rad) + dy * Math.cos(rad);
        return { x, y };
      };

      // Calculate rotated positions of the 4 corners
      const tl = getRotatedCorner(-shape.width / 2, -shape.height / 2);
      const tr = getRotatedCorner(shape.width / 2, -shape.height / 2);
      const br = getRotatedCorner(shape.width / 2, shape.height / 2);
      const bl = getRotatedCorner(-shape.width / 2, shape.height / 2);

      // Rotate logo is drawn 40px above the top-middle edge of the shape
      const logoPos = getRotatedCorner(0, -shape.height / 2 - 40);
      // We store it centered for a 20x20 icon size
      this.rotateIconLocation = { x: logoPos.x - 10, y: logoPos.y - 10 };

      this.shapeSelectors = [];
      // Top-Left handle
      this.shapeSelectors.push({
        id: 1,
        centerX: tl.x,
        centerY: tl.y,
        radius: radius / this.zoom,
        type: "selector",
        angle: shape.angle || 0,
      });
      // Top-Right handle
      this.shapeSelectors.push({
        id: 2,
        centerX: tr.x,
        centerY: tr.y,
        radius: radius / this.zoom,
        type: "selector",
        angle: shape.angle || 0,
      });
      // Bottom-Right handle
      this.shapeSelectors.push({
        id: 3,
        centerX: br.x,
        centerY: br.y,
        radius: radius / this.zoom,
        type: "selector",
        angle: shape.angle || 0,
      });
      // Bottom-Left handle
      this.shapeSelectors.push({
        id: 4,
        centerX: bl.x,
        centerY: bl.y,
        radius: radius / this.zoom,
        type: "selector",
        angle: shape.angle || 0,
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
        // angle: shape.angle || 0
      });
    } else if (shape.type === "line") {
      const { centerX, centerY } = this.getShapeCenters(shape);
      const rad = ((shape.angle || 0) * Math.PI) / 180;

      const getRotatedPoint = (dx: number, dy: number) => {
        const x = centerX + dx * Math.cos(rad) - dy * Math.sin(rad);
        const y = centerY + dx * Math.sin(rad) + dy * Math.cos(rad);
        return { x, y };
      };

      // Calculate rotated endpoints
      const startRotated = getRotatedPoint(
        shape.startX - centerX,
        shape.startY - centerY,
      );
      const endRotated = getRotatedPoint(
        shape.endX - centerX,
        shape.endY - centerY,
      );

      // Rotate logo is drawn 40px above the midpoint
      const logoPos = getRotatedPoint(0, -40);
      this.rotateIconLocation = { x: logoPos.x - 10, y: logoPos.y - 10 };

      const radius = 6;
      this.shapeSelectors = [];
      // Handle at line start coordinate
      this.shapeSelectors.push({
        id: 1,
        centerX: startRotated.x,
        centerY: startRotated.y,
        radius: radius / this.zoom,
        type: "selector",
      });
      // Handle at line end coordinate
      this.shapeSelectors.push({
        id: 2,
        centerX: endRotated.x,
        centerY: endRotated.y,
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
    //first check with rotate icon if it is there
    if (this.rotateIconLocation) {
      const dist = Math.sqrt(
        (x - this.rotateIconLocation.x) ** 2 +
          (y - this.rotateIconLocation.y) ** 2,
      );
      if (dist <= 10) {
        console.log("rotate");
        return "rotate";
      }
    }

    // 1. Check intersection with selector handles (high-priority check)
    for (let i = 0; i < this.shapeSelectors.length; i++) {
      const selectorId = i + 1;
      const selector = this.shapeSelectors[selectorId - 1];
      const dist = Math.sqrt(
        (x - selector.centerX) ** 2 + (y - selector.centerY) ** 2,
      );
      if (dist <= selector.radius) {
        return selector;
      }
    }

    // 2. Check intersection with drawing shapes (from topmost down to bottommost)
    for (let i = this.existingShapes.length - 1; i >= 0; i--) {
      const shape = this.existingShapes[i];

      if (shape.type === "rectangle" || shape.type === "image") {
        const { centerX, centerY } = this.getShapeCenters(shape);
        const rad = ((shape.angle || 0) * Math.PI) / 180;

        // Rotate test point back to unrotated space around center
        const dx = x - centerX;
        const dy = y - centerY;
        const unrotatedX = centerX + dx * Math.cos(-rad) - dy * Math.sin(-rad);
        const unrotatedY = centerY + dx * Math.sin(-rad) + dy * Math.cos(-rad);

        // Point-in-rectangle check (handles negative width and height correctly)
        const xMin = Math.min(shape.startX, shape.startX + shape.width);
        const xMax = Math.max(shape.startX, shape.startX + shape.width);
        const yMin = Math.min(shape.startY, shape.startY + shape.height);
        const yMax = Math.max(shape.startY, shape.startY + shape.height);
        if (
          unrotatedX >= xMin &&
          unrotatedX <= xMax &&
          unrotatedY >= yMin &&
          unrotatedY <= yMax
        ) {
          return shape;
        }
      } else if (shape.type === "circle") {
        // Distance check: Point distance from circle origin must be <= radius
        const dist = Math.sqrt(
          (x - shape.centerX) ** 2 + (y - shape.centerY) ** 2,
        );
        if (dist <= shape.radius) {
          return shape;
        }
      } else if (shape.type === "line") {
        const { centerX, centerY } = this.getShapeCenters(shape);
        const rad = ((shape.angle || 0) * Math.PI) / 180;

        // Rotate test point back to unrotated space around center
        const dx = x - centerX;
        const dy = y - centerY;
        const unrotatedX = centerX + dx * Math.cos(-rad) - dy * Math.sin(-rad);
        const unrotatedY = centerY + dx * Math.sin(-rad) + dy * Math.cos(-rad);

        // Closest-point-on-line-segment check using projection on unrotated coords:
        const x1 = shape.startX;
        const y1 = shape.startY;
        const x2 = shape.endX;
        const y2 = shape.endY;

        const A = unrotatedX - x1; // Vector from start point to test coordinates
        const B = unrotatedY - y1;
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

        const dx_hit = unrotatedX - xx;
        const dy_hit = unrotatedY - yy;
        const distance = Math.sqrt(dx_hit * dx_hit + dy_hit * dy_hit);

        // Define hit-test tolerance of 5 pixels (makes clicking line elements easier)
        if (distance < 5) {
          return shape;
        }
      } else if (shape.type === "text") {
        const box = this.getShapeBoundingBox(shape);
        if (x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2) {
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

      if (data.type == "joined_room") {
        this.users = data.curRoomUsers;
        this.myUserId = data.myUserId;
        this.onRoomJoined?.(data.myUserId, data.curRoomUsers);
        this.updateScreenCoordinates();
      }

      // Kicked from room
      if (data.type === "kicked") {
        alert("You have been removed from this room by the owner.");
        window.location.href = "/rooms";
        return;
      }

      // Room role was updated
      if (data.type === "role_updated") {
        const myUpdate = data.updates.find(
          (u: any) => u.userId === this.myUserId,
        );
        if (myUpdate) {
          const oldRole = this.myRole;
          const newRole = myUpdate.role;
          this.setMyRole(newRole);
          this.onRoleChange?.(newRole);

          if (newRole === "Viewer") {
            this.selectedShape = null;
            this.shapeSelectors = [];
            this.rotateIconLocation = null;
            this.clearCanvas();
            this.triggerSelectionChange();
            alert(
              "Your role has been updated to Viewer. You can no longer edit this board.",
            );
          } else if (oldRole === "Viewer" && newRole !== "Viewer") {
            alert(
              `Your role has been updated to ${newRole}. You can now edit the board!`,
            );
          }
        }
      }

      // Remote user created a shape
      if (data.type == "shape created") {
        const shape = {
          id: data.shape.id,
          userId: data.userId,
          updatedByUserId: data.userId,
          ...data.shape.shape,
        };

        this.existingShapes.push(shape);
        this.existingShapes.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        this.clearCanvas();

        if (data.userId === this.myUserId) {
          const tempHistoryId = data.shape.shape?.tempHistoryId;
          if (tempHistoryId && this.pendingHistoryMap.has(tempHistoryId)) {
            const action = this.pendingHistoryMap.get(tempHistoryId)!;
            if (action.type === "create" || action.type === "delete") {
              action.shapeId = shape.id;
              action.shape = shape;
              delete (action.shape as any).tempHistoryId;
            }
            this.pendingHistoryMap.delete(tempHistoryId);
          } else {
            this.undoStack.push({
              type: "create",
              shapeId: shape.id,
              shape: { ...shape },
            });
            this.redoStack = [];
          }
          this.triggerHistoryChange();
        }
      }

      // Remote user modified a shape
      if (data.type === "shape_updated") {
        if (data.from === this.myUserId) {
          return;
        }
        const shape = this.existingShapes.find((s) => s.id === data.shape.id);
        if (shape) {
          const updatedShape = JSON.parse(data.shape.shape);
          Object.assign(shape, updatedShape);
          shape.updatedByUserId = data.shape.updatedByUserId;
          this.existingShapes.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
          this.clearCanvas();
          if (this.selectedShape && this.selectedShape.id === data.shape.id) {
            this.triggerSelectionChange();
          }
        }
      }

      if (data.type === "shape_deleted") {
        const shape = this.existingShapes.find((s) => s.id === data.shapeId);
        if (shape) {
          this.existingShapes = this.existingShapes.filter(
            (s) => s.id !== data.shapeId,
          );
          if (this.selectedShape && this.selectedShape.id === data.shapeId) {
            this.selectedShape = null;
            this.shapeSelectors = [];
            this.rotateIconLocation = null;
            this.triggerSelectionChange();
          }
          this.clearCanvas();
        }

        if (data.from !== this.myUserId) {
          this.undoStack = this.undoStack.filter(
            (action) => action.shapeId !== data.shapeId,
          );
          this.redoStack = this.redoStack.filter(
            (action) => action.shapeId !== data.shapeId,
          );
          this.triggerHistoryChange();
        }
      }

      // Remote user cleared the canvas
      if (data.type == "cleared") {
        this.existingShapes = [];
        this.selectedShape = null;
        this.shapeSelectors = [];
        this.rotateIconLocation = null;
        this.undoStack = [];
        this.redoStack = [];
        this.triggerHistoryChange();
        this.clearCanvas();
      }

      if (data.type === "coordinates_received") {
        const coords = data.coordinates;
        if (coords) {
          this.focusOnCoordinates(
            coords.canvasStartX,
            coords.canvasStartY,
            coords.canvasEndX,
            coords.canvasEndY,
          );
        }
      }

      if (data.type === "get_screen_coordinates_fail") {
        alert(
          "Could not locate member. They might not be actively panning or are offline.",
        );
      }
    };

    // Send the join_room message after onmessage listener is registered to prevent race conditions
    this.ws.send(
      JSON.stringify({
        type: "join_room",
        roomId: this.roomId,
        canvasEndX: window.innerWidth,
        canvasEndY: window.innerHeight,
      }),
    );
  };

  /**
   * Initializes the whiteboard engine state.
   * Resolves existing shapes, resizes the canvas window viewport,
   * sets the drawing styles, and sets up window resize listeners.
   */
  init = async () => {
    if (!this.ctx) return;

    // Fetch existing shape lists from room database history
    this.existingShapes = (await this.getExistingShapes(this.roomId)) || [];

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
    this.debouncedUpdateScreenCoordinates?.();
  };

  /**
   * Registers mouse event listeners onto the Canvas element.
   */
  initMouseHandlers = () => {
    this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
    this.canvas.addEventListener("dblclick", this.mouseDoubleClickHandler);
    this.canvas.addEventListener("click", this.mouseClickHandler);
    this.canvas.addEventListener("wheel", this.mouseWheelHandler);
  };

  /**
   * Registers keyboard event listeners onto the global window scope.
   */
  initKeyboardHandlers = () => {
    window.addEventListener("keydown", this.keyboardDownHandler);
    window.addEventListener("keyup", this.keyboardUpHandler);
    window.addEventListener("keydown", this.oneTimeKeyboardPressHandler);
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
        withCredentials: true,
      });
      const data = res.data.shapes;
      if (Array.isArray(data)) {
        data.sort((a: any, b: any) => (a.zIndex || 0) - (b.zIndex || 0));
      }
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

    if (this.tempShapes && this.tempShapes.length > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.35; // Reduce pen opacity to 35% for temp shapes
      this.tempShapes.forEach((shape) => {
        this.ctx.save();
        if (shape.type === "rectangle") {
          this.ctx.translate(
            shape.startX + shape.width / 2,
            shape.startY + shape.height / 2,
          );
          this.ctx.rotate(shape.angle ? shape.angle * (Math.PI / 180) : 0);
          this.ctx.translate(
            -shape.startX - shape.width / 2,
            -shape.startY - shape.height / 2,
          );
          if (shape.color) {
            this.ctx.strokeStyle = this.getEffectiveColor(shape.color);
          }
          if (shape.bg_color) {
            this.ctx.fillStyle = shape.bg_color;
            this.ctx.fillRect(
              shape.startX,
              shape.startY,
              shape.width,
              shape.height,
            );
          }
          this.ctx.strokeRect(
            shape.startX,
            shape.startY,
            shape.width,
            shape.height,
          );
        } else if (shape.type === "line") {
          if (shape.color) {
            this.ctx.strokeStyle = this.getEffectiveColor(shape.color);
          }
          this.ctx.beginPath();
          this.ctx.moveTo(shape.startX, shape.startY);
          this.ctx.lineTo(shape.endX, shape.endY);
          this.ctx.stroke();
        } else if (shape.type === "circle") {
          if (shape.color) {
            this.ctx.strokeStyle = this.getEffectiveColor(shape.color);
          }
          this.ctx.beginPath();
          this.ctx.arc(
            shape.centerX,
            shape.centerY,
            shape.radius,
            0,
            2 * Math.PI,
          );
          if (shape.bg_color) {
            this.ctx.fillStyle = shape.bg_color;
            this.ctx.fill();
          }
          this.ctx.stroke();
        } else if (shape.type === "image") {
          if (shape.url) {
            const img = this.getImage(shape.url);
            if (img) {
              this.ctx.drawImage(
                img,
                shape.startX,
                shape.startY,
                shape.width,
                shape.height,
              );
            } else {
              this.ctx.strokeRect(
                shape.startX,
                shape.startY,
                shape.width,
                shape.height,
              );
            }
          } else {
            this.ctx.strokeRect(
              shape.startX,
              shape.startY,
              shape.width,
              shape.height,
            );
          }
        } else if (shape.type === "text") {
          this.ctx.textBaseline = "top";
          this.ctx.font = `${shape.fontSize || 20}px sans-serif`;
          this.ctx.fillStyle = this.getEffectiveColor(shape.color);
          this.ctx.fillText(shape.text, shape.startX, shape.startY);
        }
        this.ctx.restore();
      });
      this.ctx.restore();
    }

    if (this.rotateIconLocation && this.rotateImg) {
      this.ctx.drawImage(
        this.rotateImg,
        this.rotateIconLocation.x,
        this.rotateIconLocation.y,
        20,
        20,
      );
    }

    // 3. Render all shapes loaded in memory (or replay shapes if in replay mode)
    const shapesToDraw =
      this.replayShapes !== null ? this.replayShapes : this.existingShapes;
    if (shapesToDraw.length > 0) {
      shapesToDraw.forEach((shape) => {
        if (shape.id !== undefined && shape.id === this.editingTextShapeId)
          return;
        this.ctx.save();
        const { centerX, centerY } = this.getShapeCenters(shape);
        if (shape.type === "rectangle") {
          this.ctx.translate(centerX, centerY);
          this.ctx.rotate(((shape.angle || 0) * Math.PI) / 180);
          if (shape.color) {
            this.ctx.strokeStyle = this.getEffectiveColor(shape.color);
          }
          if (shape.bg_color) {
            this.ctx.fillStyle = shape.bg_color;
            this.ctx.fillRect(
              -shape.width / 2,
              -shape.height / 2,
              shape.width,
              shape.height,
            );
          }
          this.ctx.strokeRect(
            -shape.width / 2,
            -shape.height / 2,
            shape.width,
            shape.height,
          );
        } else if (shape.type === "line") {
          this.ctx.translate(centerX, centerY);
          this.ctx.rotate(((shape.angle || 0) * Math.PI) / 180);
          if (shape.color) {
            this.ctx.strokeStyle = this.getEffectiveColor(shape.color);
          }
          this.ctx.beginPath();
          this.ctx.moveTo(shape.startX - centerX, shape.startY - centerY);
          this.ctx.lineTo(shape.endX - centerX, shape.endY - centerY);
          this.ctx.stroke();
        } else if (shape.type === "circle") {
          if (shape.color) {
            this.ctx.strokeStyle = this.getEffectiveColor(shape.color);
          }
          this.ctx.beginPath();
          this.ctx.arc(
            shape.centerX,
            shape.centerY,
            shape.radius,
            0,
            2 * Math.PI,
          );
          if (shape.bg_color) {
            this.ctx.fillStyle = shape.bg_color;
            this.ctx.fill();
          }
          this.ctx.stroke();
        } else if (shape.type === "image") {
          const centerX = shape.startX + shape.width / 2;
          const centerY = shape.startY + shape.height / 2;

          this.ctx.translate(centerX, centerY);
          this.ctx.rotate(((shape.angle || 0) * Math.PI) / 180);

          if (shape.url) {
            const img = this.getImage(shape.url);
            if (img) {
              this.ctx.drawImage(
                img,
                -shape.width / 2,
                -shape.height / 2,
                shape.width,
                shape.height,
              );
            } else {
              this.ctx.setLineDash([10, 5]);
              this.ctx.strokeRect(
                -shape.width / 2,
                -shape.height / 2,
                shape.width,
                shape.height,
              );
            }
          } else {
            this.ctx.setLineDash([10, 5]);
            this.ctx.strokeRect(
              -shape.width / 2,
              -shape.height / 2,
              shape.width,
              shape.height,
            );
            this.ctx.strokeRect(
              -shape.width / 6,
              -shape.height / 6,
              shape.width / 3,
              shape.height / 3,
            );
            const img = this.getImage("/add-image.png");
            if (img) {
              this.ctx.drawImage(
                img,
                -shape.width / 6,
                -shape.height / 6,
                shape.width / 3,
                shape.height / 3,
              );
            }
          }
        } else if (shape.type === "text") {
          this.ctx.textBaseline = "top";
          this.ctx.font = `${shape.fontSize || 20}px sans-serif`;
          this.ctx.fillStyle = this.getEffectiveColor(shape.color);
          this.ctx.fillText(shape.text, shape.startX, shape.startY);
        }
        this.ctx.restore();
      });

      // Draw connector line for the rotate handle
      if (
        this.rotateIconLocation &&
        this.selectedShape &&
        (this.selectedShape.type === "rectangle" ||
          this.selectedShape.type === "image" ||
          this.selectedShape.type === "line")
      ) {
        const { centerX, centerY } = this.getShapeCenters(this.selectedShape);
        const rad = ((this.selectedShape.angle || 0) * Math.PI) / 180;

        let baseLocalX = 0;
        let baseLocalY = 0;
        let logoLocalX = 0;
        let logoLocalY = 0;

        if (this.selectedShape.type === "line") {
          baseLocalX = 0;
          baseLocalY = 0;
          logoLocalX = 0;
          logoLocalY = -40;
        } else {
          // rectangle or image
          baseLocalX = 0;
          baseLocalY = -this.selectedShape.height / 2;
          logoLocalX = 0;
          logoLocalY = -this.selectedShape.height / 2 - 40;
        }

        const baseWorldX =
          centerX + baseLocalX * Math.cos(rad) - baseLocalY * Math.sin(rad);
        const baseWorldY =
          centerY + baseLocalX * Math.sin(rad) + baseLocalY * Math.cos(rad);

        const logoWorldX =
          centerX + logoLocalX * Math.cos(rad) - logoLocalY * Math.sin(rad);
        const logoWorldY =
          centerY + logoLocalX * Math.sin(rad) + logoLocalY * Math.cos(rad);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(baseWorldX, baseWorldY);
        this.ctx.lineTo(logoWorldX, logoWorldY);
        this.ctx.strokeStyle = "#f97316"; // Orange connector line
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([5, 3]); // Dashed line
        this.ctx.stroke();
        this.ctx.restore();
      }

      // 4. Render control handles overlay if a shape is selected in pointer mode
      if (this.shapeSelectors.length > 0 && this.selectedShape) {
        this.ctx.save();
        this.shapeSelectors.forEach((selector) => {
          this.ctx.beginPath();
          this.ctx.arc(
            selector.centerX,
            selector.centerY,
            selector.radius,
            0,
            2 * Math.PI,
          );
          this.ctx.fillStyle = "#ffffff";
          this.ctx.fill();
          this.ctx.strokeStyle = "#f97316"; // Orange border
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();
        });
        this.ctx.restore();
      }
    }
    this.triggerViewportChange();
  };

  setReplayShapes = (replayShapes: Shape[] | null) => {
    this.replayShapes = replayShapes;
    this.clearCanvas();
    this.selectedShape = null;
    this.shapeSelectors = [];
    this.rotateIconLocation = null;
  };

  /**
   * Cleans up canvas event listeners and window keyboard listeners.
   * Prevents memory leaks when the component mounts and unmounts in web applications.
   */
  destroy = () => {
    if (this.coordinateUpdateTimeout) {
      clearTimeout(this.coordinateUpdateTimeout);
      this.coordinateUpdateTimeout = null;
    }
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    this.canvas.removeEventListener("click", this.mouseClickHandler);
    this.canvas.removeEventListener("dblclick", this.mouseDoubleClickHandler);
    this.canvas.removeEventListener("wheel", this.mouseWheelHandler);
    window.removeEventListener("keydown", this.keyboardDownHandler);
    window.removeEventListener("keyup", this.keyboardUpHandler);
    window.removeEventListener("keydown", this.oneTimeKeyboardPressHandler);
  };
}
