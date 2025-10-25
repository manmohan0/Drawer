export interface Shape {
    type: 'rect' | 'circle' | 'line';
    startX: number;
    startY: number;
    width?: number;
    height?: number;
    endX?: number;
    endY?: number;
}