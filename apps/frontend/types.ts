export type Shape = {
    type: 'rect';
    startX: number;
    startY: number;
    width: number;
    height: number;
} | {
    type: 'line';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
} | {
    type: 'circle';
    centerX: number;
    centerY: number;
    radius: number;
} | {
    type: 'pointer',
    x: number,
    y: number
}

export type selector = {
    id: number;
    type: 'selector';
    centerX: number;
    centerY: number;
    radius: number;
}

export type ShapeType = 'rect' | 'line' | 'circle' | 'pointer';