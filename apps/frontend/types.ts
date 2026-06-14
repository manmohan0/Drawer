export type Shape = {
    id?: number;
    type: 'rect';
    startX: number;
    startY: number;
    width: number;
    height: number;
    userId?: string;
} | {
    id?: number;
    type: 'line';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    userId?: string;
} | {
    id?: number;
    type: 'circle';
    centerX: number;
    centerY: number;
    radius: number;
    userId?: string;
} | {
    id?: number,
    type: 'image',
    url?: string,
    startX: number,
    startY: number,
    width: number,
    height: number
    userId?: string;
} | {
    type: 'pointer',
    x: number,
    y: number,
}

export type selector = {
    id: number;
    type: 'selector';
    centerX: number;
    centerY: number;
    radius: number;
}

export type ShapeType = 'rect' | 'line' | 'circle' | 'image' | 'pointer';