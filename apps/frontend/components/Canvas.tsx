import { BACKEND_URL } from "@/config";
import { Game } from "@/Draw/Game";
import { role, Shape, ShapeType } from "@/types";
import axios from "axios";
import { Circle, PencilLine, Pointer, RectangleHorizontal, Image, Trash2, User, Hash, Sparkles, Check, X, Loader2, PaintBucket, ArrowUp, ArrowDown, Type, LogOut, ChevronDown, Folder, Eye, Play, Pause, SkipBack, SkipForward, UserMinus, Undo, Redo } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCookie, deleteCookie } from "@/utils/cookie";
import { EventType } from "@repo/common/enum";

export const Canvas = ({ roomId, ws }: { roomId: string; ws: WebSocket }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const colorChangeTimeoutRef = useRef<any>(null);
  const metricChangeTimeoutRef = useRef<any>(null);
  const originalShapeRef = useRef<Shape | null>(null);
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [myRooms, setMyRooms] = useState<any[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<any | null>(null);
  const [myUserName, setMyUserName] = useState<string>("Account");
  const [myRole, setMyRoleState] = useState<role | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<Record<string, { firstName: string; lastName: string }>>({});
  const [isShapeDetailsCollapsed, setIsShapeDetailsCollapsed] = useState(false);
  const [isMembersListCollapsed, setIsMembersListCollapsed] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const fetchRooms = async () => {
    setRoomsLoading(true);
    try {
      const token = getCookie("Authorization");
      const res = await axios.get(`${BACKEND_URL}/room/myRooms`, {
        headers: {
          Authorization: token,
        },
        withCredentials: true,
      });
      if (res.data && res.data.rooms) {
        setMyRooms(res.data.rooms);
      }
    } catch (err) {
      console.error("Failed to fetch rooms:", err);
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    if (isDropdownOpen) {
      fetchRooms();
    }
  }, [isDropdownOpen]);

  useEffect(() => {
    const fetchCurrentRoom = async () => {
      try {
        const token = getCookie("Authorization");
        const res = await axios.get(`${BACKEND_URL}/room/${roomId}`, {
          headers: {
            Authorization: token,
          },
          withCredentials: true,
        });
        if (res.data && res.data.room) {
          console.log(res.data);
          setMyRoleState(res.data.myRole);
          setCurrentRoom(res.data.room);
        }
      } catch (err) {
        console.error("Failed to fetch current room details:", err);
      }
    };
    fetchCurrentRoom();
  }, [roomId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    deleteCookie("Authorization");
    router.push("/signin");
  };

  const [game, setGame] = useState<Game>();
  const [tool, setTool] = useState<ShapeType>("rectangle");
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [tempShapes, setTempShapes] = useState<Shape[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState("#ffffff");
  const [textEditState, setTextEditState] = useState<{
    x: number;
    y: number;
    value: string;
    fontSize: number;
    onSave: (val: string) => void;
    onCancel: () => void;
  } | null>(null);

  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayEvents, setReplayEvents] = useState<any[]>([]);
  const [replayCurrentIndex, setReplayCurrentIndex] = useState(-1);
  const [replayIsPlaying, setReplayIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(500); // ms delay
  const [gridSpacing, setGridSpacing] = useState<number>(20);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const computeReplayShapes = (eventsList: any[], targetIndex: number): Shape[] => {
    const shapesMap = new Map<number, Shape>();

    for (let i = 0; i <= targetIndex; i++) {
      const event = eventsList[i];
      if (!event) continue;

      const eventType = event.eventType;
      const shapeId = event.shapeId;
      const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;

      if (eventType === "CREATE_SHAPE" || eventType === "ADD_IMAGE") {
        shapesMap.set(shapeId, {
          id: shapeId,
          userId: event.userId,
          updatedByUserId: event.userId,
          ...payload
        } as Shape);
      } else if (eventType === "DELETE_SHAPE") {
        shapesMap.delete(shapeId);
      } else {
        const existing = shapesMap.get(shapeId);
        if (existing) {
          shapesMap.set(shapeId, {
            ...existing,
            ...payload
          } as Shape);
        }
      }
    }

    return Array.from(shapesMap.values());
  };

  useEffect(() => {
    if (!replayIsPlaying || replayEvents.length === 0) return;
    if (replayCurrentIndex >= replayEvents.length - 1) {
      setReplayIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      setReplayCurrentIndex(prev => {
        const next = prev + 1;
        const shapes = computeReplayShapes(replayEvents, next);
        game?.setReplayShapes(shapes);
        return next;
      });
    }, replaySpeed);

    return () => clearTimeout(timer);
  }, [replayIsPlaying, replayCurrentIndex, replaySpeed, replayEvents, game]);

  useEffect(() => {
    if (!game) return;

    const unsubscribe = game.subscribeHistoryChange(() => {
      setCanUndo(game.canUndo());
      setCanRedo(game.canRedo());
    });

    setCanUndo(game.canUndo());
    setCanRedo(game.canRedo());

    return () => {
      unsubscribe();
    };
  }, [game]);

  useEffect(() => {
    if (!game) return;

    const unsubscribe = game.subscribeViewportChange(() => {
      setPan({ x: game.panX, y: game.panY });
      setZoom(game.zoom);
    });

    setPan({ x: game.panX, y: game.panY });
    setZoom(game.zoom);

    return () => {
      unsubscribe();
    };
  }, [game]);


  const startReplayMode = async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    setSelectedShape(null); // Clear selected shape so details card hides
    try {
      const token = getCookie("Authorization");
      const res = await axios.get(`${BACKEND_URL}/room/events/${roomId}`, {
        headers: {
          Authorization: token,
        },
        withCredentials: true,
      });

      if (res.data && res.data.success) {
        const events = res.data.events || [];
        setReplayEvents(events);
        setReplayCurrentIndex(-1);
        game.setReplayShapes([]); // Clear the canvas to start replay
        setIsReplayMode(true);
        setReplayIsPlaying(true); // Auto play
      } else {
        setError("Failed to load events for replay.");
      }
    } catch (err: any) {
      console.error("Replay fetch failed:", err);
      setError("Failed to load room events history.");
    } finally {
      setLoading(false);
    }
  };

  const stopReplayMode = () => {
    setIsReplayMode(false);
    setReplayIsPlaying(false);
    setReplayEvents([]);
    setReplayCurrentIndex(-1);
    game?.setReplayShapes(null); // Restore live canvas drawing
  };


  useEffect(() => {
    if (game && myRole) {
      game.setMyRole(myRole);
    }
  }, [game, myRole]);

  const handlePromptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setTempShapes([]);

    try {
      const res = await axios.post(`${BACKEND_URL}/ai/generate`, { prompt }, {
        withCredentials: true
      });

      if (res && res.data.success) {
        const shapesData = res.data.shapes;
        const shapesArray = Array.isArray(shapesData) ? shapesData : (shapesData?.shapes || []);
        if (shapesArray.length === 0) {
          setError("AI did not generate any shapes for this prompt.");
        } else {
          setTempShapes(shapesArray);
        }
      } else {
        setError("Something went wrong on the AI server.");
      }
    } catch (err: any) {
      console.error("Failed to generate shapes:", err);
      setError(
        err.response?.data?.message ||
        "Failed to generate shapes. Please make sure GEMINI_API_KEY is configured in http-backend env."
      );
    } finally {
      setLoading(false);
      setPrompt("");
    }
  };

  const handleAcceptShapes = () => {
    ws.send(
      JSON.stringify({
        type: "chat-multiple",
        roomId,
        shapes: tempShapes,
      })
    );
    setTempShapes([]);
  };

  const handleRejectShapes = () => {
    setTempShapes([]);
  };

  const handleRemoveUser = async (targetUserId: string) => {
    if (myRole !== "Owner" || !currentRoom) return;

    if (!confirm("Are you sure you want to remove this user from the room?")) {
      return;
    }

    try {
      const token = getCookie("Authorization");
      const res = await axios.delete(`${BACKEND_URL}/room/${currentRoom.slug}/removeUser`, {
        headers: {
          Authorization: token
        },
        data: {
          userId: targetUserId
        },
        withCredentials: true
      });

      if (res.data && res.data.success) {
        // User kicked successfully
      } else {
        setError("Failed to remove user");
      }
    } catch (err: any) {
      console.error("Failed to remove user:", err);
      setError(err.response?.data?.message || "Failed to remove user");
    }
  };

  const onColorChange = (newColor: string) => {
    setColor(newColor);
    game?.setColor(newColor);
  };
  const types = [
    { name: "rectangle", logo: <RectangleHorizontal /> },
    { name: "line", logo: <PencilLine /> },
    { name: "circle", logo: <Circle /> },
    { name: "image", logo: <Image /> },
    { name: "text", logo: <Type /> },
    { name: "bucket", logo: <PaintBucket /> },
    { name: "pointer", logo: <Pointer /> },
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const game = new Game(canvas, roomId, ws, (shape) => {
        setSelectedShape(shape);
      });

      game.onMouseMove = (x, y) => {
        setMousePos({ x, y });
      };

      game.onRoleChange = (newRole) => {
        setMyRoleState(newRole);
      };

      game.onRoomJoined = (myUserId, users) => {
        setMyUserId(myUserId);
        const user = users[myUserId];
        if (user) {
          setMyUserName(`${user.firstName} ${user.lastName}`.trim());
        }
        setActiveUsers(users);
      };

      game.onStartTextEdit = (x, y, text, fontSize, onSave, onCancel) => {
        setTextEditState({
          x,
          y,
          value: text,
          fontSize,
          onSave,
          onCancel
        });
      };

      setGame(game);
      return () => {
        game.destroy();
      };
    }
  }, [canvasRef, roomId, ws]);

  useEffect(() => {
    if (game) {
      game.setTempShapes(tempShapes);
    }
  }, [tempShapes, game]);

  const onTypeChange = (type: ShapeType) => {
    game?.setTool(type);
    setTool(type);
  };

  const clearCanvas = () => {
    ws.send(
      JSON.stringify({
        type: "clear",
        roomId,
      })
    );
  };

  const getShapeDetails = () => {
    if (!selectedShape) return null;

    switch (selectedShape.type) {
      case "rectangle":
        return {
          title: "Rectangle",
          icon: <RectangleHorizontal className="w-5 h-5 text-indigo-500" />,
          bgColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
          metrics: [
            { label: "Position X", value: Math.round(selectedShape.startX), key: "startX", editable: true },
            { label: "Position Y", value: Math.round(selectedShape.startY), key: "startY", editable: true },
            { label: "Width", value: Math.round(selectedShape.width), key: "width", editable: true },
            { label: "Height", value: Math.round(selectedShape.height), key: "height", editable: true },
            { label: "Area", value: `${Math.round(Math.abs(selectedShape.width * selectedShape.height))} px²`, editable: false },
          ]
        };
      case "circle":
        const radius = Math.round(selectedShape.radius);
        const area = Math.round(Math.PI * radius * radius);
        return {
          title: "Circle",
          icon: <Circle className="w-5 h-5 text-orange-500" />,
          bgColor: "bg-orange-50 text-orange-700 border-orange-200",
          metrics: [
            { label: "Center X", value: Math.round(selectedShape.centerX), key: "centerX", editable: true },
            { label: "Center Y", value: Math.round(selectedShape.centerY), key: "centerY", editable: true },
            { label: "Radius", value: radius, key: "radius", editable: true },
            { label: "Circumference", value: `${Math.round(2 * Math.PI * radius)} px`, editable: false },
            { label: "Area", value: `${area} px²`, editable: false },
          ]
        };
      case "line":
        const dx = selectedShape.endX - selectedShape.startX;
        const dy = selectedShape.endY - selectedShape.startY;
        const length = Math.round(Math.sqrt(dx * dx + dy * dy));
        return {
          title: "Line",
          icon: <PencilLine className="w-5 h-5 text-emerald-500" />,
          bgColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
          metrics: [
            { label: "Start X", value: Math.round(selectedShape.startX), key: "startX", editable: true },
            { label: "Start Y", value: Math.round(selectedShape.startY), key: "startY", editable: true },
            { label: "End X", value: Math.round(selectedShape.endX), key: "endX", editable: true },
            { label: "End Y", value: Math.round(selectedShape.endY), key: "endY", editable: true },
            { label: "Length", value: `${length} px`, editable: false },
          ]
        };
      case "image":
        return {
          title: "Image",
          icon: <Image className="w-5 h-5 text-sky-500" />,
          bgColor: "bg-sky-50 text-sky-700 border-sky-200",
          metrics: [
            { label: "Position X", value: Math.round(selectedShape.startX), key: "startX", editable: true },
            { label: "Position Y", value: Math.round(selectedShape.startY), key: "startY", editable: true },
            { label: "Width", value: Math.round(selectedShape.width), key: "width", editable: true },
            { label: "Height", value: Math.round(selectedShape.height), key: "height", editable: true },
            { label: "URL Status", value: selectedShape.url ? "Loaded" : "No image uploaded", editable: false },
          ]
        };
      case "text":
        return {
          title: "Text",
          icon: <Type className="w-5 h-5 text-indigo-500" />,
          bgColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
          metrics: [
            { label: "Position X", value: Math.round(selectedShape.startX), key: "startX", editable: true },
            { label: "Position Y", value: Math.round(selectedShape.startY), key: "startY", editable: true },
            { label: "Font Size", value: selectedShape.fontSize || 20, key: "fontSize", editable: true },
            { label: "Text", value: selectedShape.text, key: "text", editable: true },
          ]
        };
      default:
        return null;
    }
  };

  useEffect(() => {
    return () => {
      if (metricChangeTimeoutRef.current) {
        clearTimeout(metricChangeTimeoutRef.current);
        metricChangeTimeoutRef.current = null;
      }
      originalShapeRef.current = null;
    };
  }, [selectedShape?.id]);

  const handleMetricChange = (key: string, valStr: string) => {
    if (!selectedShape || !game) return;

    let val: any;
    if (key === "text") {
      val = valStr;
    } else {
      val = Number(valStr);
      if (isNaN(val)) return;
    }

    const updatedShape = {
      ...selectedShape,
      [key]: val
    } as Shape;

    if (!originalShapeRef.current) {
      originalShapeRef.current = selectedShape;
    }

    setSelectedShape(updatedShape);

    if (metricChangeTimeoutRef.current) {
      clearTimeout(metricChangeTimeoutRef.current);
    }

    metricChangeTimeoutRef.current = setTimeout(() => {
      const origShape = originalShapeRef.current || selectedShape;
      let eventType: EventType | undefined = undefined;
      let extraFields: Record<string, any> = {};

      if (key === "text") {
        eventType = EventType.CHANGE_TEXT;
        extraFields = {
          fromText: origShape.type === "text" ? origShape.text : "",
          toText: val
        };
      } else if (["startX", "startY", "centerX", "centerY", "endX", "endY"].includes(key)) {
        eventType = EventType.MOVE_SHAPE;
        if (updatedShape.type === "line") {
          extraFields = {
            fromStartX: (origShape as any).startX,
            fromStartY: (origShape as any).startY,
            fromEndX: (origShape as any).endX,
            fromEndY: (origShape as any).endY,
            toStartX: (updatedShape as any).startX,
            toStartY: (updatedShape as any).startY,
            toEndX: (updatedShape as any).endX,
            toEndY: (updatedShape as any).endY
          };
        } else {
          const fromX = (origShape as any).startX !== undefined ? (origShape as any).startX : (origShape as any).centerX;
          const fromY = (origShape as any).startY !== undefined ? (origShape as any).startY : (origShape as any).centerY;
          const toX = (updatedShape as any).startX !== undefined ? (updatedShape as any).startX : (updatedShape as any).centerX;
          const toY = (updatedShape as any).startY !== undefined ? (updatedShape as any).startY : (updatedShape as any).centerY;
          extraFields = {
            fromX,
            fromY,
            toX,
            toY
          };
        }
      } else if (["width", "height", "radius"].includes(key)) {
        eventType = EventType.SCALE_SHAPE;
        if (updatedShape.type === "rectangle" || updatedShape.type === "image") {
          extraFields = {
            fromWidth: (origShape as any).width,
            fromHeight: (origShape as any).height,
            toWidth: (updatedShape as any).width,
            toHeight: (updatedShape as any).height
          };
        } else if (updatedShape.type === "circle") {
          extraFields = {
            fromRadius: (origShape as any).radius,
            toRadius: (updatedShape as any).radius
          };
        }
      }

      game.updateShape(updatedShape, eventType, extraFields);
      metricChangeTimeoutRef.current = null;
      originalShapeRef.current = null;
    }, 500);
  };

  const handleColorChange = (key: "color" | "bg_color", newColor: string) => {
    if (!selectedShape || !game) return;

    const updatedShape = {
      ...selectedShape,
      [key]: newColor
    } as Shape;

    const eventType = key === "color" ? EventType.CHANGE_STROKE : EventType.CHANGE_FILL;
    const fromColor = (selectedShape as any)[key] || eventType === EventType.CHANGE_STROKE ? "#000000" : "";
    const toColor = newColor;

    if (colorChangeTimeoutRef.current) {
      clearTimeout(colorChangeTimeoutRef.current);
    }

    colorChangeTimeoutRef.current = setTimeout(() => game.updateShape(updatedShape, eventType, {
      fromColor,
      toColor
    }), 500);
  };

  const details = getShapeDetails();
  const creatorName = selectedShape ? game?.getUserName(selectedShape.userId) : null;
  const updaterName = selectedShape ? game?.getUserName(selectedShape.updatedByUserId) : null;
  const shapeId = selectedShape ? selectedShape.id : null;

  return (
    <div className="relative overflow-hidden w-screen h-screen">
      <canvas
        ref={canvasRef}
        width={4320}
        height={2160}
        onMouseLeave={() => setMousePos(null)}
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          backgroundSize: `${gridSpacing * zoom}px ${gridSpacing * zoom}px`,
        }}
        className="bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_1.5px,transparent_1px)] bg-zinc-950"
      ></canvas>

      {/* Mouse coordinates indicator */}
      {mousePos && (
        <div className="absolute bottom-4 left-4 z-50 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 shadow-xl rounded-xl px-3.5 py-1.5 text-[11px] font-bold text-zinc-300 font-mono tracking-wide pointer-events-none select-none flex items-center space-x-2">
          <span className="text-zinc-500">X:</span>
          <span>{mousePos.x}</span>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-500">Y:</span>
          <span>{mousePos.y}</span>
        </div>
      )}
      {/* Shape details card */}
      {details && (
        <div className="absolute top-4 left-4 z-50 w-72 bg-zinc-900/75 backdrop-blur-md border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 transform scale-100 hover:shadow-orange-500/10 animate-in fade-in duration-200">
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 bg-zinc-950/50 select-none ${!isShapeDetailsCollapsed ? "border-b border-zinc-800" : ""}`}>
            <div className="flex items-center space-x-2">
              {details.icon}
              <span className="font-semibold text-zinc-200 tracking-wide text-sm">{details.title}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-zinc-500 font-mono flex items-center bg-zinc-950 px-1.5 py-0.5 rounded">
                <Hash className="w-2.5 h-2.5 mr-0.5" />
                {shapeId !== undefined ? shapeId : "Local"}
              </span>
              <button
                onClick={() => setIsShapeDetailsCollapsed(!isShapeDetailsCollapsed)}
                className="p-1 text-zinc-500 hover:text-orange-500 rounded-lg transition-colors cursor-pointer"
                title={isShapeDetailsCollapsed ? "Expand Details" : "Collapse Details"}
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isShapeDetailsCollapsed ? "" : "rotate-180"}`} />
              </button>
            </div>
          </div>

          {/* Body */}
          {!isShapeDetailsCollapsed && (
            <div className="p-4 space-y-4">
              {/* Grid of details */}
              <div className="grid grid-cols-2 gap-3">
                {details.metrics.map((metric, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col p-2 rounded-xl bg-zinc-950/40 border border-zinc-850 transition-all duration-200 hover:bg-zinc-950 hover:border-orange-500/30 hover:shadow-sm ${metric.label === "Area" || metric.label === "Length" || metric.label === "Circumference" || metric.label === "URL Status" || metric.key === "text"
                      ? "col-span-2"
                      : ""
                      }`}
                  >
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                      {metric.label}
                    </span>
                    {metric.editable && metric.key ? (
                      <div className="flex items-center space-x-1 mt-0.5 w-full">
                        <input
                          type={metric.key === "text" ? "text" : "number"}
                          value={metric.value}
                          onChange={(e) => handleMetricChange(metric.key!, e.target.value)}
                          disabled={myRole === "Viewer"}
                          className="text-xs font-semibold text-zinc-200 bg-transparent border-b border-dashed border-zinc-800 hover:border-orange-400 focus:border-orange-500 focus:outline-none w-full py-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                        {metric.key !== "text" && (
                          <span className="text-[10px] text-zinc-500">px</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-zinc-200 mt-0.5">
                        {metric.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Colors Section */}
              {selectedShape && (selectedShape.type === "rectangle" || selectedShape.type === "circle" || selectedShape.type === "line" || selectedShape.type === "text") && (
                <div className="pt-3 border-t border-zinc-850 space-y-3">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">
                    Colors
                  </span>

                  {/* Border/Text Color */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-300 font-medium">
                      {selectedShape.type === "text" ? "Text Color" : "Border Color"}
                    </span>
                    <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 transition-colors shadow-sm ${myRole === "Viewer" ? "cursor-not-allowed opacity-50" : "cursor-pointer group"}`}>
                      <input
                        type="color"
                        value={selectedShape.color || "#000000"}
                        onChange={(e) => handleColorChange("color", e.target.value)}
                        disabled={myRole === "Viewer"}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10 disabled:cursor-not-allowed"
                      />
                      <div
                        className="w-5 h-5 rounded-full border border-zinc-800 shadow-inner transition-transform duration-200 group-hover:scale-110"
                        style={{ backgroundColor: selectedShape.color || "#000000" }}
                      />
                    </div>
                  </div>

                  {/* Fill Color (only for rect and circle) */}
                  {(selectedShape.type === "rectangle" || selectedShape.type === "circle") && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-300 font-medium">Fill Color</span>
                      <div className="flex items-center space-x-2">
                        {/* Transparent toggler */}
                        <button
                          onClick={() => handleColorChange("bg_color", "")}
                          disabled={myRole === "Viewer"}
                          className={`px-2 py-1 text-[10px] font-semibold border rounded-lg transition-all ${!selectedShape.bg_color
                            ? "bg-orange-500/10 border-orange-500/20 text-orange-400 shadow-sm"
                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          Transparent
                        </button>
                        <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 transition-colors shadow-sm ${myRole === "Viewer" ? "cursor-not-allowed opacity-50" : "cursor-pointer group"}`}>
                          <input
                            type="color"
                            value={selectedShape.bg_color || "#ffffff"}
                            onChange={(e) => handleColorChange("bg_color", e.target.value)}
                            disabled={myRole === "Viewer"}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10 disabled:cursor-not-allowed"
                          />
                          <div
                            className="w-5 h-5 rounded-full border border-zinc-800 shadow-inner transition-transform duration-200 group-hover:scale-110"
                            style={{ backgroundColor: selectedShape.bg_color || "#ffffff" }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Creator & Updater info */}
              <div className="pt-3 border-t border-zinc-850 flex flex-col gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-zinc-500 space-x-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Created by:</span>
                  </div>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${creatorName === "You"
                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                    : "bg-zinc-950 text-zinc-450"
                    }`}>
                    {creatorName || "Unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-zinc-500 space-x-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Updated by:</span>
                  </div>
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${updaterName === "You"
                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                    : "bg-zinc-950 text-zinc-450"
                    }`}>
                    {updaterName || creatorName || "Unknown"}
                  </span>
                </div>
              </div>

              {/* Layering Actions */}
              {myRole !== "Viewer" && (
                <>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => game?.bringForward()}
                      className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-750 text-zinc-200 font-semibold rounded-xl text-xs transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      <span>Bring Forward</span>
                    </button>
                    <button
                      onClick={() => game?.sendBackward()}
                      className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-750 text-zinc-200 font-semibold rounded-xl text-xs transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span>Send Backward</span>
                    </button>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => game?.deleteSelectedShape()}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 hover:border-red-500/35 text-red-400 font-semibold rounded-xl text-xs transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Shape</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {myRole === "Viewer" ? (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 shadow-lg rounded-2xl px-5 py-2.5 flex items-center space-x-2 text-xs font-bold text-zinc-400 select-none tracking-wide">
          <Eye className="w-4 h-4 text-orange-500" />
          <span>VIEWER MODE (READ-ONLY)</span>
        </div>
      ) : (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 shadow-xl rounded-2xl flex space-x-2 p-2 justify-center items-center">
          {types.map((type) => (
            <div
              key={type.name}
              onClick={() => onTypeChange(type.name as ShapeType)}
              className={`cursor-pointer px-2 py-1 ${tool === type.name ? "text-orange-500" : "text-zinc-500"} hover:bg-zinc-800 rounded`}
            >
              {type.logo}
            </div>
          ))}

          {/* Divider */}
          <div className="h-6 w-px bg-zinc-800 self-center"></div>

          {/* Color picker */}
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer group">
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
            />
            <div
              className="w-5 h-5 rounded-full border border-zinc-800 shadow-sm transition-transform duration-200 group-hover:scale-110"
              style={{ backgroundColor: color }}
            />
          </div>

          {/* Undo Button */}
          <button
            onClick={() => game?.undo()}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded transition-colors ${canUndo
                ? "text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                : "text-zinc-700 cursor-not-allowed"
              }`}
          >
            <Undo className="w-4 h-4" />
          </button>

          {/* Redo Button */}
          <button
            onClick={() => game?.redo()}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={`p-1.5 rounded transition-colors ${canRedo
                ? "text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                : "text-zinc-700 cursor-not-allowed"
              }`}
          >
            <Redo className="w-4 h-4" />
          </button>

          {/* Divider */}
          <div className="h-6 w-px bg-zinc-800 self-center"></div>

          <div
            onClick={clearCanvas}
            className="cursor-pointer px-2 py-1 text-zinc-400 hover:bg-zinc-800 rounded"
          >
            Clear
          </div>
        </div>
      )}

      {/* Profile & Replay menu */}
      <div className="absolute top-4 right-4 z-50 flex items-center space-x-2.5" ref={dropdownRef}>
        {!isReplayMode && (
          <button
            onClick={startReplayMode}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 hover:shadow-orange-500/20 text-white font-semibold shadow-lg hover:shadow-xl rounded-full px-4 py-2 transition-all duration-200 cursor-pointer active:scale-95 text-xs select-none border border-orange-500/10"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-orange-200" />
            <span>Replay Time-Lapse</span>
          </button>
        )}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center space-x-2 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 shadow-lg hover:shadow-xl rounded-full p-1.5 pr-3 transition-all duration-200 cursor-pointer active:scale-95 group"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-inner">
            <User className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-zinc-200 select-none">{myUserName}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 mt-2 w-72 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-top-2 origin-top-right">
            {/* Header */}
            <div className="px-4 py-3 bg-zinc-950/50 border-b border-zinc-800">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block">Drawer Session</span>
            </div>

            {/* Current Room Details */}
            {currentRoom && (
              <div className="px-4 py-3 border-b border-zinc-800 bg-orange-500/5 space-y-2">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block">
                  Current Room Details
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <div className="flex flex-col bg-zinc-950 p-3.5 rounded-xl border border-zinc-850/50 shadow-sm col-span-2">
                    <span className="text-[9px] uppercase font-bold text-zinc-500">Room Code</span>
                    <span className="font-mono font-bold text-zinc-200 text-sm mt-0.5">{currentRoom.slug}</span>
                  </div>
                  <div className="flex flex-col bg-zinc-950 p-3.5 rounded-xl border border-zinc-850/50 shadow-sm">
                    <span className="text-[9px] uppercase font-bold text-zinc-500">Admin</span>
                    <span
                      className="font-medium text-zinc-200 mt-0.5 truncate text-xs"
                      title={
                        Array.isArray(currentRoom.admin)
                          ? currentRoom.admin.map((a: any) => `${a.firstName} ${a.lastName}`).join(", ")
                          : currentRoom.admin
                            ? `${currentRoom.admin.firstName} ${currentRoom.admin.lastName}`
                            : "None"
                      }
                    >
                      {Array.isArray(currentRoom.admin)
                        ? (currentRoom.admin[0] ? `${currentRoom.admin[0].firstName} ${currentRoom.admin[0].lastName}` : "Unknown")
                        : (currentRoom.admin ? `${currentRoom.admin.firstName} ${currentRoom.admin.lastName}` : "Unknown")
                      }
                    </span>
                  </div>
                  <div className="flex flex-col bg-zinc-950 p-3.5 rounded-xl border border-zinc-850/50 shadow-sm">
                    <span className="text-[9px] uppercase font-bold text-zinc-500">Created On</span>
                    <span className="font-medium text-zinc-200 mt-0.5">
                      {new Date(currentRoom.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/room-details/${currentRoom.slug}`);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-zinc-850 hover:bg-zinc-800 text-orange-400 hover:text-orange-300 border border-zinc-800 font-bold rounded-xl text-[10px] transition-all duration-200 active:scale-95 shadow-inner mt-2 cursor-pointer"
                >
                  <span>View Members & Roles</span>
                </button>
              </div>
            )}

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Navigate to All Rooms Page */}
              <button
                type="button"
                onClick={() => {
                  router.push("/rooms");
                  setIsDropdownOpen(false);
                }}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold rounded-xl text-xs transition-all duration-200 active:scale-95 shadow-md shadow-orange-500/10 cursor-pointer"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Go to My Rooms Page</span>
              </button>

              {/* Rooms List */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center">
                  <Folder className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                  My Rooms
                </span>

                {roomsLoading ? (
                  <div className="flex items-center justify-center py-6 text-zinc-500 space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                    <span className="text-xs">Loading rooms...</span>
                  </div>
                ) : myRooms.length === 0 ? (
                  <div className="text-center py-4 text-xs text-zinc-500 bg-zinc-950/50 rounded-xl border border-dashed border-zinc-850">
                    No rooms joined yet.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                    {myRooms.map((room) => {
                      const isCurrent = String(room.slug) === String(roomId);
                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            if (!isCurrent) {
                              router.push(`/canvas/${room.slug}`);
                            }
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${isCurrent
                            ? "bg-orange-500/10 border-orange-500/25 text-orange-400 font-semibold"
                            : "bg-zinc-950 hover:bg-zinc-900 border-zinc-850 hover:border-zinc-800 text-zinc-400 hover:text-zinc-200"
                            }`}
                        >
                          <span className="text-xs font-mono">Room Code: {room.slug}</span>
                          {isCurrent && (
                            <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-bold uppercase">
                              Active
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 text-red-400 font-semibold rounded-xl text-xs transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Room Members Panel */}
      {Object.keys(activeUsers).length > 0 && (
        <div className={`absolute top-20 right-4 z-50 w-64 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 shadow-lg rounded-2xl p-4 flex flex-col transition-all duration-300 overflow-hidden hover:shadow-orange-500/5 ${isMembersListCollapsed ? "max-h-[52px]" : "max-h-[300px]"}`}>
          <div className={`flex items-center justify-between ${!isMembersListCollapsed ? "pb-2 border-b border-zinc-800" : ""}`}>
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-bold text-zinc-200 tracking-wide">Room Members</span>
            </div>
            <button
              onClick={() => setIsMembersListCollapsed(!isMembersListCollapsed)}
              className="p-1 text-zinc-500 hover:text-orange-400 rounded-lg transition-colors cursor-pointer"
              title={isMembersListCollapsed ? "Expand Members" : "Collapse Members"}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isMembersListCollapsed ? "" : "rotate-180"}`} />
            </button>
          </div>
          {!isMembersListCollapsed && (
            <div className="overflow-y-auto mt-2 space-y-1 flex-1 pr-1 scrollbar-thin">
              {Object.entries(activeUsers).map(([uId, u]) => {
                const name = `${u.firstName} ${u.lastName}`.trim();
                const isMe = uId === myUserId;
                return (
                  <div key={uId} className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-950/80 transition-colors">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center text-[10px] font-bold select-none">
                        {u.firstName[0] || ""}{u.lastName[0] || ""}
                      </div>
                      <span className="text-xs text-zinc-200 font-medium truncate max-w-[130px]" title={name}>
                        {name} {isMe && "(You)"}
                      </span>
                    </div>
                    {!isMe && (
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => {
                            ws.send(JSON.stringify({
                              type: "get_screen_coordinates",
                              roomId,
                              userId: uId
                            }));
                          }}
                          className="p-1 text-zinc-500 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Locate member on canvas"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {myRole === "Owner" && (
                          <button
                            onClick={() => handleRemoveUser(uId)}
                            className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Remove user from room"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI Preview Controls & Error Messages */}
      <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4 sm:px-0 flex flex-col items-center space-y-2 pointer-events-none">
        {error && (
          <div className="w-full flex items-center justify-between bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-2xl shadow-xl pointer-events-auto animate-in fade-in duration-200">
            <span className="text-xs font-semibold">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-550 hover:text-red-400 transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {tempShapes.length > 0 && (
          <div className="flex items-center space-x-3 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl rounded-2xl px-4 py-3 pointer-events-auto animate-in fade-in duration-200">
            <span className="text-xs font-semibold text-zinc-200">
              AI generated {tempShapes.length} shapes
            </span>
            <button
              onClick={handleAcceptShapes}
              className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Accept</span>
            </button>
            <button
              onClick={handleRejectShapes}
              className="flex items-center space-x-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
          </div>
        )}
      </div>

      {/* AI Request Input Bar */}
      {myRole !== "Viewer" && !isReplayMode && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4 sm:px-0">
          <form
            onSubmit={handlePromptSubmit}
            className="flex items-center space-x-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 shadow-2xl rounded-2xl p-1.5 transition-all duration-300 hover:shadow-orange-500/10 focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/10"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              placeholder={loading ? "AI is thinking and drawing..." : "Ask AI to draw something... (e.g. 'draw a red circle')"}
              className="flex-1 bg-transparent border-none outline-none pl-3 text-sm text-zinc-200 placeholder-zinc-500 py-2 w-full focus:ring-0 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={!prompt.trim() || loading}
              className="flex items-center justify-center bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:bg-zinc-800 text-white disabled:text-zinc-600 p-2.5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shadow-md disabled:shadow-none"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      )}

      {/* Inline Text Editor Overlay */}
      {textEditState && (
        <div
          contentEditable
          suppressContentEditableWarning
          autoFocus
          onBlur={(e) => {
            textEditState.onSave(e.currentTarget.textContent || "");
            setTextEditState(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              textEditState.onSave(e.currentTarget.textContent || "");
              setTextEditState(null);
            } else if (e.key === "Escape") {
              textEditState.onCancel();
              setTextEditState(null);
            }
          }}
          style={{
            position: "absolute",
            left: textEditState.x,
            top: textEditState.y,
            fontSize: `${textEditState.fontSize * (game?.getZoom() || 1)}px`,
            color: game?.getSelectedColor() || "#000000",
            fontFamily: "sans-serif",
            background: "transparent",
            border: "none",
            outline: "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            padding: 0,
            margin: 0,
            zIndex: 1000,
            minWidth: "100px",
          }}
          ref={(el) => {
            if (el && el.textContent !== textEditState.value) {
              el.textContent = textEditState.value;
              const range = document.createRange();
              const sel = window.getSelection();
              range.selectNodeContents(el);
              range.collapse(false);
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }}
        />
      )}
      {/* Replay Control Bar */}
      {isReplayMode && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-xl px-4 sm:px-0">
          <div className="bg-zinc-900/85 backdrop-blur-xl border border-zinc-800 shadow-[0_20px_50px_rgba(249,115,22,0.08)] rounded-3xl p-5 flex flex-col space-y-4 transition-all duration-300">
            {/* Header info */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">
                  Event Replay Mode
                </span>
                <span className="text-xs font-semibold text-zinc-200 mt-0.5">
                  Step {replayCurrentIndex + 1} of {replayEvents.length}
                </span>
              </div>
              <div className="text-xs font-medium text-zinc-400 max-w-[280px] truncate bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-1.5" title={replayEvents[replayCurrentIndex]?.description}>
                {replayEvents[replayCurrentIndex]?.description || "Empty room - no events recorded"}
              </div>
            </div>

            {/* Scrubber slider */}
            <div className="flex items-center space-x-3 group">
              <span className="text-[10px] font-bold text-zinc-500 select-none w-8 text-center font-mono">START</span>
              <input
                type="range"
                min={-1}
                max={replayEvents.length - 1}
                value={replayCurrentIndex}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setReplayCurrentIndex(val);
                  const shapes = computeReplayShapes(replayEvents, val);
                  game?.setReplayShapes(shapes);
                }}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 outline-none transition-all focus:ring-2 focus:ring-orange-500/10"
              />
              <span className="text-[10px] font-bold text-zinc-500 select-none w-8 text-center font-mono">END</span>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-3">
                {/* Back button */}
                <button
                  onClick={() => {
                    if (replayCurrentIndex <= -1) return;
                    setReplayIsPlaying(false);
                    setReplayCurrentIndex(prev => {
                      const next = prev - 1;
                      const shapes = computeReplayShapes(replayEvents, next);
                      game?.setReplayShapes(shapes);
                      return next;
                    });
                  }}
                  disabled={replayCurrentIndex <= -1}
                  className="p-2 text-zinc-550 hover:text-orange-400 hover:bg-zinc-800 hover:border-zinc-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all cursor-pointer border border-transparent"
                  title="Previous Step"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                {/* Play/Pause button */}
                <button
                  onClick={() => {
                    if (replayCurrentIndex >= replayEvents.length - 1) {
                      // Restart playback if at the end
                      setReplayCurrentIndex(-1);
                      game?.setReplayShapes([]);
                    }
                    setReplayIsPlaying(!replayIsPlaying);
                  }}
                  className="p-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl shadow-lg hover:shadow-orange-500/35 transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center"
                  title={replayIsPlaying ? "Pause Playback" : "Start Playback"}
                >
                  {replayIsPlaying ? (
                    <Pause className="w-4.5 h-4.5 fill-white stroke-white" />
                  ) : (
                    <Play className="w-4.5 h-4.5 fill-white stroke-white ml-0.5" />
                  )}
                </button>

                {/* Forward button */}
                <button
                  onClick={() => {
                    if (replayCurrentIndex >= replayEvents.length - 1) return;
                    setReplayIsPlaying(false);
                    setReplayCurrentIndex(prev => {
                      const next = prev + 1;
                      const shapes = computeReplayShapes(replayEvents, next);
                      game?.setReplayShapes(shapes);
                      return next;
                    });
                  }}
                  disabled={replayCurrentIndex >= replayEvents.length - 1}
                  className="p-2 text-zinc-555 hover:text-orange-400 hover:bg-zinc-800 hover:border-zinc-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all cursor-pointer border border-transparent"
                  title="Next Step"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Speed Controller */}
              <div className="flex items-center space-x-1.5 bg-zinc-950 border border-zinc-850 p-1.5 rounded-2xl text-[10px] font-bold text-zinc-500">
                {[1000, 500, 200, 50].map((speed, idx) => {
                  const label = ["0.5x", "1x", "2.5x", "10x"][idx];
                  return (
                    <button
                      key={speed}
                      onClick={() => setReplaySpeed(speed)}
                      className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer select-none ${replaySpeed === speed
                        ? "bg-zinc-800 text-orange-400 border border-zinc-700 font-extrabold"
                        : "hover:bg-zinc-900 hover:text-zinc-300"
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Stop / Exit */}
              <button
                onClick={stopReplayMode}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 text-red-400 font-semibold rounded-2xl text-xs transition-all duration-200 active:scale-95 cursor-pointer shadow-sm"
              >
                Exit Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
