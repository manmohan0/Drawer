import { BACKEND_URL } from "@/config";
import { Game } from "@/Draw/Game";
import { Shape, ShapeType } from "@/types";
import axios from "axios";
import { Circle, PencilLine, Pointer, RectangleHorizontal, Image, Trash2, User, Hash, Sparkles, Check, X, Loader2 } from "lucide-react";
import { useRef, useState, useEffect } from "react";

export const Canvas = ({ roomId, ws }: { roomId: string; ws: WebSocket }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game>();
  const [tool, setTool] = useState<ShapeType>("rect");
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [tempShapes, setTempShapes] = useState<Shape[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const types = [
    { name: "rect", logo: <RectangleHorizontal /> },
    { name: "line", logo: <PencilLine /> },
    { name: "circle", logo: <Circle /> },
    { name: "image", logo: <Image /> },
    { name: "pointer", logo: <Pointer /> }
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const game = new Game(canvas, roomId, ws, (shape) => {
        setSelectedShape(shape);
      });
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
      case "rect":
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
      default:
        return null;
    }
  };

  const handleMetricChange = (key: string, valStr: string) => {
    if (!selectedShape || !game) return;
    const val = Number(valStr);
    if (isNaN(val)) return;

    const updatedShape = {
      ...selectedShape,
      [key]: val
    } as Shape;

    game.updateShape(updatedShape);
  };

  const details = getShapeDetails();
  const creatorName = selectedShape && selectedShape.type !== "pointer" ? game?.getUserName(selectedShape.userId) : null;
  const shapeId = selectedShape && selectedShape.type !== "pointer" ? selectedShape.id : null;

  return (
    <div className="overflow-hidden w-screen h-screen">
      <canvas
        ref={canvasRef}
        width={"4320px"}
        height={"2160px"}
        className="bg-[radial-gradient(circle_at_center,#73737330_2px,transparent_1px)] bg-white bg-size-[20px_20px] border-2 border-black"
      ></canvas>

      {/* Shape details card */}
      {details && (
        <div className="absolute top-4 left-4 z-50 w-72 bg-white/75 backdrop-blur-md border border-gray-200/50 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 transform scale-100 hover:shadow-indigo-100/30 animate-in fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center space-x-2">
              {details.icon}
              <span className="font-semibold text-gray-800 tracking-wide text-sm">{details.title}</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-gray-400 font-mono flex items-center bg-gray-100 px-1.5 py-0.5 rounded">
                <Hash className="w-2.5 h-2.5 mr-0.5" />
                {shapeId !== undefined ? shapeId : "Local"}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Grid of details */}
            <div className="grid grid-cols-2 gap-3">
              {details.metrics.map((metric, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col p-2 rounded-xl bg-gray-50/70 border border-gray-100 transition-all duration-200 hover:bg-white hover:border-indigo-100 hover:shadow-sm ${
                    metric.label === "Area" || metric.label === "Length" || metric.label === "Circumference" || metric.label === "URL Status"
                      ? "col-span-2" 
                      : ""
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    {metric.label}
                  </span>
                  {metric.editable && metric.key ? (
                    <div className="flex items-center space-x-1 mt-0.5">
                      <input
                        type="number"
                        value={metric.value}
                        onChange={(e) => handleMetricChange(metric.key!, e.target.value)}
                        className="text-xs font-semibold text-gray-700 bg-transparent border-b border-dashed border-gray-300 hover:border-indigo-400 focus:border-indigo-500 focus:outline-none w-full py-0.5"
                      />
                      <span className="text-[10px] text-gray-400">px</span>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-gray-700 mt-0.5">
                      {metric.value}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Creator info */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <div className="flex items-center text-gray-500 space-x-1.5">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span>Created by:</span>
              </div>
              <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
                creatorName === "You" 
                  ? "bg-indigo-50 text-indigo-600 border border-indigo-100" 
                  : "bg-gray-100 text-gray-600"
              }`}>
                {creatorName || "Unknown"}
              </span>
            </div>

            {/* Actions */}
            <button
              onClick={() => game?.deleteSelectedShape()}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-200 text-red-600 hover:text-red-700 font-semibold rounded-xl text-xs transition-all duration-200 active:scale-95 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Shape</span>
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 border shadow-md rounded-2xl flex space-x-2 p-2 justify-center bg-gray-200">
        {types.map((type) => (
          <div
            key={type.name}
            onClick={() => onTypeChange(type.name as ShapeType)}
            className={`cursor-pointer px-2 py-1 ${tool === type.name ? "text-orange-500" : "text-gray-400"} hover:bg-gray-100 rounded`}
          >
            {type.logo}
          </div>
        ))}
        <div
          onClick={clearCanvas}
          className="cursor-pointer px-2 py-1 text-gray-400 hover:bg-gray-100 rounded"
        >
          Clear
        </div>
      </div>

      {/* AI Preview Controls & Error Messages */}
      <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4 sm:px-0 flex flex-col items-center space-y-2 pointer-events-none">
        {error && (
          <div className="w-full flex items-center justify-between bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-2xl shadow-xl pointer-events-auto animate-in fade-in duration-200">
            <span className="text-xs font-semibold">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {tempShapes.length > 0 && (
          <div className="flex items-center space-x-3 bg-white/95 backdrop-blur-md border border-indigo-100 shadow-2xl rounded-2xl px-4 py-3 pointer-events-auto animate-in fade-in duration-200">
            <span className="text-xs font-semibold text-gray-700">
              AI generated {tempShapes.length} shapes
            </span>
            <button
              onClick={handleAcceptShapes}
              className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Accept</span>
            </button>
            <button
              onClick={handleRejectShapes}
              className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 hover:border-red-200 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
          </div>
        )}
      </div>

      {/* AI Request Input Bar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4 sm:px-0">
        <form 
          onSubmit={handlePromptSubmit} 
          className="flex items-center space-x-2 bg-white/90 backdrop-blur-md border border-gray-200/50 shadow-2xl rounded-2xl p-1.5 transition-all duration-300 hover:shadow-indigo-100/40 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            placeholder={loading ? "AI is thinking and drawing..." : "Ask AI to draw something... (e.g. 'draw a red circle')"}
            className="flex-1 bg-transparent border-none outline-none pl-3 text-sm text-gray-800 placeholder-gray-400 py-2 w-full focus:ring-0 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || loading}
            className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 text-white disabled:text-gray-400 p-2.5 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer shadow-md disabled:shadow-none"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
