import { ShapeType } from "@/types"

export const TabButton = ({ type, onTypeChange } : { type: string, onTypeChange: (type: ShapeType) => void }) => {
    return <div key={type} onClick={() => onTypeChange(type as ShapeType)} className="cursor-pointer px-2 py-1 text-gray-400 hover:bg-gray-100 rounded">
        {type}
    </div>
}