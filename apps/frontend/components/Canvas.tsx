import { Game } from "@/Draw/Game";
// import { initDraw } from "@/DrawUtils";
import { ShapeType } from "@/types";
import { useRef, useState, useEffect } from "react";

export const Canvas = ({ roomId, ws } : { roomId: string, ws: WebSocket }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [game, setGame] = useState<Game>();
    const types = ["rect", 'line', 'circle'];
    
    // const [currentType, setCurrentType] = useState<ShapeType>("rect");

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const game = new Game(canvas, roomId, ws);
            setGame(game)
            return () => {
                game.destroy();
            }
        }
    }, [canvasRef, roomId, ws])

    const onTypeChange = (type: ShapeType) => {
        game?.setTool(type);
    }

    const clearCanvas = () => {
        ws.send(JSON.stringify({
            type: "clear",
            roomId
        }));
    }

    return <div>
        <div className="">
            <canvas ref={canvasRef} width={"1920px"} height={"1080px"} className="bg-white border-2 border-black"></canvas>
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 border shadow-md rounded-2xl flex space-x-2 p-2 justify-center bg-gray-200">
                {types.map((type) => (
                    <div key={type} onClick={() => onTypeChange(type as ShapeType)} className="cursor-pointer px-2 py-1 text-gray-400 hover:bg-gray-100 rounded">
                        {type}
                    </div>
                ))}
                <div onClick={clearCanvas} className="cursor-pointer px-2 py-1 text-gray-400 hover:bg-gray-100 rounded">
                    Clear
                </div>
            </div>
        </div>
    </div>
}